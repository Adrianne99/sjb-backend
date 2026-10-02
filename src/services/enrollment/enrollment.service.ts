// Enrollment rules:
// - One enrollment record per student per term (DB unique constraint + check here).
// - The year level must exist for the program (Grade 11–12 for Senior High,
//   1st–2nd year for IT and HRS).
// - The section must belong to the same academic year, program and year level.
// - Archived students cannot be enrolled.
// - Creating an enrollment and its assessment lines happens in ONE transaction.
import { prisma, type DbClient } from "../../config/database";
import { toEnrollmentDto } from "../../mappers/enrollment.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import * as enrollmentRepository from "../../repositories/enrollment.repository";
import * as studentRepository from "../../repositories/student.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { fromDateOnlyString } from "../../utils/dates";
import { toMoneyString } from "../../utils/money";
import { buildPaginationMeta, toSkipTake } from "../../utils/pagination";
import { fullName } from "../../utils/person";
import type {
  AssessmentItemInput,
  CreateEnrollmentInput,
  ListEnrollmentsQuery,
  UpdateEnrollmentInput,
} from "../../validators/enrollment.validators";
import { assertYearLevel, yearLevelLabel } from "../../utils/year-levels";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { buildPaymentSchedule, parseTuitionLine, PLAN_LABELS, tuitionLineDescription } from "../fees/fee-calculator";
import { readBreakdown } from "../fees/fee.service";
import { getBalancesForEnrollments } from "../payments/balance.service";
import { toDecimal } from "../../utils/money";
import { notifyEnrollmentConfirmed, notifyLater } from "../notifications/student-notifications.service";
import { createAccountIfApplicant } from "../students/student-account.service";

async function checkSection(
  sectionId: number | null | undefined,
  context: { academicYearId: number; programId: number; yearLevel: number },
  db: DbClient,
) {
  if (!sectionId) return;
  const section = await academicRepository.findSectionById(sectionId, db);
  if (!section) throw AppError.validation({ sectionId: "Section not found." });
  if (section.academicYearId !== context.academicYearId) {
    throw AppError.validation({ sectionId: "This section belongs to a different academic year." });
  }
  if (section.programId !== context.programId) {
    throw AppError.validation({ sectionId: "This section belongs to a different program." });
  }
  if (section.yearLevel !== context.yearLevel) {
    throw AppError.validation({ sectionId: `This section is for ${yearLevelLabel(section.yearLevel)}.` });
  }
}

/** Shared by "Enroll student" and "Create student + enroll" (runs inside `tx`). */
export async function createEnrollmentRecord(input: CreateEnrollmentInput, actor: Actor, tx: DbClient) {
  const student = await studentRepository.findStudentById(input.studentId, tx);
  if (!student) throw AppError.validation({ studentId: "Student not found." });
  if (student.status === "ARCHIVED") throw AppError.badRequest("Archived students cannot be enrolled. Restore the record first.");

  const semester = await academicRepository.findSemesterById(input.semesterId, tx);
  if (!semester) throw AppError.validation({ semesterId: "Term not found." });

  const program = await tx.program.findUnique({ where: { id: input.programId } });
  if (!program) throw AppError.validation({ programId: "Program not found." });
  assertYearLevel(program, input.yearLevel);

  const existing = await enrollmentRepository.findEnrollmentForStudentAndTerm(student.id, semester.id, tx);
  if (existing) {
    throw AppError.conflict(
      `${fullName(student)} already has an enrollment record for ${semester.name}, ${semester.academicYear.name}. Update that record instead.`,
      { semesterId: "Already enrolled for this term." },
    );
  }

  await checkSection(input.sectionId, { academicYearId: semester.academicYearId, programId: program.id, yearLevel: input.yearLevel }, tx);

  const enrollment = await enrollmentRepository.createEnrollment(
    {
      studentId: student.id,
      semesterId: semester.id,
      programId: program.id,
      yearLevel: input.yearLevel,
      sectionId: input.sectionId ?? null,
      enrollmentDate: fromDateOnlyString(input.enrollmentDate),
      status: input.status,
      remarks: input.remarks,
      createdById: actor.userId,
    },
    tx,
  );

  for (const item of input.assessments) {
    await enrollmentRepository.createAssessment(
      { enrollmentId: enrollment.id, description: item.description, amount: item.amount, createdById: actor.userId },
      tx,
    );
  }

  // A program shift updates the student's current program.
  if (student.programId !== program.id) {
    await studentRepository.updateStudent(student.id, { programId: program.id }, tx);
  }

  await recordAudit(
    actor,
    {
      action: AUDIT_ACTIONS.ENROLLMENT_CREATED,
      entityType: "enrollment",
      entityId: enrollment.id,
      description: `Enrolled ${student.studentNumber} ${fullName(student)} in ${semester.name}, ${semester.academicYear.name} (${input.status})`,
      metadata: { studentId: student.id, semesterId: semester.id, assessmentLines: input.assessments.length },
    },
    tx,
  );

  return enrollment;
}

export async function listEnrollments(query: ListEnrollmentsQuery) {
  const { page, pageSize, ...filters } = query;
  const { items, total } = await enrollmentRepository.listEnrollments({ ...filters, ...toSkipTake({ page, pageSize }) });
  const balances = await getBalancesForEnrollments(items.map((item) => item.id));
  return {
    items: items.map((item) => ({ ...toEnrollmentDto(item), balance: balances.get(item.id)! })),
    meta: buildPaginationMeta({ page, pageSize }, total),
  };
}

export async function getEnrollment(id: number) {
  const enrollment = await enrollmentRepository.findEnrollmentById(id);
  if (!enrollment) throw AppError.notFound("Enrollment not found.");
  const [assessments, balances] = await Promise.all([
    enrollmentRepository.findAssessmentsForEnrollment(id),
    getBalancesForEnrollments([id]),
  ]);
  const balance = balances.get(id)!;
  return {
    ...toEnrollmentDto(enrollment),
    balance,
    paymentPlan: enrollment.paymentPlan,
    paymentPlanLabel: enrollment.paymentPlan ? PLAN_LABELS[enrollment.paymentPlan] : null,
    paymentSchedule: buildPaymentSchedule(enrollment.paymentPlan, readBreakdown(enrollment.feeBreakdown), toDecimal(balance.totalAssessed), toDecimal(balance.totalPaid)),
    assessments: assessments.map((item) => ({
      id: item.id,
      description: item.description,
      amount: toMoneyString(item.amount),
      createdAt: item.createdAt.toISOString(),
      /** Set for the per-unit tuition line: staff change the units and the amount is calculated. */
      tuitionUnits: parseTuitionLine(item.description),
    })),
  };
}

export async function createEnrollment(input: CreateEnrollmentInput, actor: Actor) {
  const enrollment = await prisma.$transaction((tx) => createEnrollmentRecord(input, actor, tx));
  // Saved — online applicants get their portal account now, then the student is emailed.
  if (enrollment.status === "ENROLLED") {
    await createAccountIfApplicant(enrollment.studentId, actor);
    notifyLater("enrollment confirmed", () => notifyEnrollmentConfirmed(enrollment.id));
  }
  return getEnrollment(enrollment.id);
}

export async function updateEnrollment(id: number, input: UpdateEnrollmentInput, actor: Actor) {
  const current = await enrollmentRepository.findEnrollmentById(id);
  if (!current) throw AppError.notFound("Enrollment not found.");

  assertYearLevel(current.program, input.yearLevel);

  await prisma.$transaction(async (tx) => {
    await checkSection(
      input.sectionId,
      { academicYearId: current.semester.academicYearId, programId: current.programId, yearLevel: input.yearLevel },
      tx,
    );
    await enrollmentRepository.updateEnrollment(
      id,
      {
        yearLevel: input.yearLevel,
        sectionId: input.sectionId ?? null,
        enrollmentDate: fromDateOnlyString(input.enrollmentDate),
        status: input.status,
        remarks: input.remarks,
      },
      tx,
    );

    const statusNote = current.status !== input.status ? ` — status ${current.status} → ${input.status}` : "";
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.ENROLLMENT_UPDATED,
        entityType: "enrollment",
        entityId: id,
        description: `Updated enrollment of ${current.student.studentNumber} for ${current.semester.name}, ${current.semester.academicYear.name}${statusNote}`,
        metadata: {
          before: { status: current.status, yearLevel: current.yearLevel, sectionId: current.sectionId },
          after: { status: input.status, yearLevel: input.yearLevel, sectionId: input.sectionId ?? null },
        },
      },
      tx,
    );
  });

  // Email the student only when the enrollment BECOMES enrolled (not on every save).
  if (current.status !== "ENROLLED" && input.status === "ENROLLED") {
    await createAccountIfApplicant(current.studentId, actor); // online applicants: account after payment
    notifyLater("enrollment confirmed", () => notifyEnrollmentConfirmed(id));
  }
  return getEnrollment(id);
}

// --- Assessments (charges) ---------------------------------------------------

export async function addAssessment(enrollmentId: number, input: AssessmentItemInput, actor: Actor) {
  const enrollment = await enrollmentRepository.findEnrollmentById(enrollmentId);
  if (!enrollment) throw AppError.notFound("Enrollment not found.");

  await prisma.$transaction(async (tx) => {
    const item = await enrollmentRepository.createAssessment(
      { enrollmentId, description: input.description, amount: input.amount, createdById: actor.userId },
      tx,
    );
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.ASSESSMENT_CREATED,
        entityType: "tuition_assessment",
        entityId: item.id,
        description: `Added charge "${input.description}" (₱${toMoneyString(input.amount)}) to ${enrollment.student.studentNumber}`,
      },
      tx,
    );
  });
  return getEnrollment(enrollmentId);
}

/**
 * Changes the units of a tuition line ("Tuition Fee (23 units × ₱320)").
 * The amount and description are calculated here (units × rate), and the
 * enrollment's fee snapshot is updated too.
 */
export async function updateTuitionUnits(id: number, units: number, actor: Actor) {
  const item = await enrollmentRepository.findAssessmentById(id);
  if (!item) throw AppError.notFound("Assessment line not found.");
  const line = parseTuitionLine(item.description);
  if (!line) throw AppError.badRequest("Only the tuition line (units × rate) can be changed by units.");

  const snapshot = readBreakdown(item.enrollment.feeBreakdown);
  const ratePerUnit = snapshot?.ratePerUnit ?? line.ratePerUnit;
  const amount = units * ratePerUnit;
  const description = tuitionLineDescription(units, ratePerUnit);

  await prisma.$transaction(async (tx) => {
    await tx.tuitionAssessment.update({ where: { id }, data: { description, amount } });
    if (snapshot) await tx.enrollment.update({ where: { id: item.enrollmentId }, data: { feeBreakdown: { ...snapshot, units } } });
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.ASSESSMENT_UPDATED,
        entityType: "tuition_assessment",
        entityId: id,
        description: `Changed tuition units for ${item.enrollment.student.studentNumber} from ${line.units} to ${units} (₱${toMoneyString(item.amount)} → ₱${toMoneyString(amount)})`,
        metadata: { before: { units: line.units, amount: toMoneyString(item.amount) }, after: { units, amount: toMoneyString(amount) } },
      },
      tx,
    );
  });
  return getEnrollment(item.enrollmentId);
}

export async function updateAssessment(id: number, input: AssessmentItemInput, actor: Actor) {
  const item = await enrollmentRepository.findAssessmentById(id);
  if (!item) throw AppError.notFound("Assessment line not found.");

  await enrollmentRepository.updateAssessment(id, { description: input.description, amount: input.amount });
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.ASSESSMENT_UPDATED,
    entityType: "tuition_assessment",
    entityId: id,
    description: `Changed charge "${item.description}" for ${item.enrollment.student.studentNumber} from ₱${toMoneyString(item.amount)} to ₱${toMoneyString(input.amount)}`,
    metadata: { before: { description: item.description, amount: toMoneyString(item.amount) }, after: { ...input, amount: toMoneyString(input.amount) } },
  });
  return getEnrollment(item.enrollmentId);
}
