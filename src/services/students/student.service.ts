// Student records: list, view, create, update, archive/restore.
import { prisma, type DbClient } from "../../config/database";
import { toEnrollmentDto } from "../../mappers/enrollment.mapper";
import { toStudentPersonalDto, toStudentProfileDto, toStudentSummaryDto } from "../../mappers/student.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import * as sessionRepository from "../../repositories/session.repository";
import * as studentRepository from "../../repositories/student.repository";
import type { Actor, AuthUser } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { fromDateOnlyString, todayInManila } from "../../utils/dates";
import { buildPaginationMeta, toSkipTake } from "../../utils/pagination";
import { fullName } from "../../utils/person";
import type { CreateStudentInput, ListStudentsQuery, UpdateStudentInput } from "../../validators/student.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { createEnrollmentRecord } from "../enrollment/enrollment.service";
import { getBalancesForStudents } from "../payments/balance.service";
import { createStudentAccount, type IssuedCredentials } from "./student-account.service";
import { notifyEnrollmentConfirmed, notifyLater } from "../notifications/student-notifications.service";

// --- Read --------------------------------------------------------------------

export async function listStudents(query: ListStudentsQuery) {
  const { page, pageSize, ...filters } = query;
  const currentTerm = await academicRepository.findCurrentSemester();

  const { items, total } = await studentRepository.listStudents({
    ...filters,
    semesterId: currentTerm?.id,
    ...toSkipTake({ page, pageSize }),
  });
  const balances = await getBalancesForStudents(items.map((student) => student.id));

  return {
    items: items.map((student) => {
      const current = student.enrollments[0];
      return {
        ...toStudentSummaryDto(student),
        currentEnrollment: current
          ? {
              id: current.id,
              status: current.status,
              yearLevel: current.yearLevel,
              sectionName: current.section?.name ?? null,
              /** Takes extra subjects with other sections. */
              irregular: current._count.extraSubjects > 0,
            }
          : null,
        hasAccount: Boolean(student.user),
        balance: balances.get(student.id)!.balance,
      };
    }),
    meta: buildPaginationMeta({ page, pageSize }, total),
    currentTerm: currentTerm ? { id: currentTerm.id, label: `${currentTerm.name}, ${currentTerm.academicYear.name}` } : null,
  };
}

/**
 * Full student record. Students may only open their OWN record; staff/admin
 * may open any. The check is here (not just in the route) so it cannot be skipped.
 */
export async function getStudentDetail(id: number, requester: AuthUser) {
  if (requester.role === "STUDENT" && requester.studentId !== id) {
    throw AppError.forbidden();
  }
  return loadStudentDetail(id);
}

/** Internal: loads the full record without a permission check. */
async function loadStudentDetail(id: number) {
  const student = await studentRepository.findStudentDetail(id);
  if (!student) throw AppError.notFound("Student not found.");

  const balances = await getBalancesForStudents([id]);
  const enrollments = student.enrollments.map((enrollment) => toEnrollmentDto(enrollment));

  return {
    ...toStudentSummaryDto(student),
    ...toStudentPersonalDto(student),
    profile: toStudentProfileDto(student.profile),
    account: student.user
      ? {
          userId: student.user.id,
          username: student.user.username,
          email: student.user.email,
          isActive: student.user.isActive,
          mustChangePassword: student.user.mustChangePassword,
          isLocked: Boolean(student.user.lockedUntil && student.user.lockedUntil > new Date()),
          lastLoginAt: student.user.lastLoginAt?.toISOString() ?? null,
          createdAt: student.user.createdAt.toISOString(),
        }
      : null,
    currentEnrollment: enrollments.find((enrollment) => enrollment.isCurrentTerm) ?? null,
    enrollments,
    balance: balances.get(id)!,
  };
}

// --- Create ------------------------------------------------------------------

/** Next free student number for this year, e.g. "2026-0042". */
async function generateStudentNumber(db: DbClient) {
  const year = todayInManila().slice(0, 4);
  const latest = await studentRepository.findLatestStudentNumber(year, db);
  const next = latest ? Number(latest.studentNumber.split("-")[1]) + 1 : 1;
  return `${year}-${String(next).padStart(4, "0")}`;
}

export interface CreateStudentOptions {
  /** Extra work done in the SAME transaction (e.g. marking an online application as converted). */
  withinTransaction?: (tx: DbClient, created: { studentId: number; enrollmentId: number | null }) => Promise<void>;
}

export async function createStudent(input: CreateStudentInput, actor: Actor, options: CreateStudentOptions = {}) {
  const result = await prisma.$transaction(async (tx) => {
    const program = await tx.program.findUnique({ where: { id: input.programId } });
    if (!program) throw AppError.validation({ programId: "Program not found." });

    const studentNumber = input.studentNumber ?? (await generateStudentNumber(tx));
    if (await studentRepository.studentNumberExists(studentNumber, tx)) {
      throw AppError.conflict(`Student ID ${studentNumber} is already in use.`, { studentNumber: "Already in use." });
    }

    const student = await studentRepository.createStudent(
      {
        studentNumber,
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        suffix: input.suffix,
        dateOfBirth: fromDateOnlyString(input.dateOfBirth),
        sex: input.sex,
        programId: program.id,
        profile: { create: input.profile },
      },
      tx,
    );

    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.STUDENT_CREATED,
        entityType: "student",
        entityId: student.id,
        description: `Created student record ${studentNumber} ${fullName(student)}`,
      },
      tx,
    );

    let enrolledId: number | null = null;
    let enrollmentId: number | null = null;
    if (input.initialEnrollment) {
      const enrollment = await createEnrollmentRecord(
        {
          studentId: student.id,
          programId: program.id,
          semesterId: input.initialEnrollment.semesterId,
          yearLevel: input.initialEnrollment.yearLevel,
          sectionId: input.initialEnrollment.sectionId ?? null,
          status: input.initialEnrollment.status,
          enrollmentDate: todayInManila(),
          remarks: null,
          assessments: [],
        },
        actor,
        tx,
      );
      enrollmentId = enrollment.id;
      if (enrollment.status === "ENROLLED") enrolledId = enrollment.id;
    }

    let credentials: IssuedCredentials | null = null;
    if (input.createAccount) {
      credentials = await createStudentAccount(student.id, { email: input.profile.email, sendEmail: false }, actor, tx);
    }

    if (options.withinTransaction) await options.withinTransaction(tx, { studentId: student.id, enrollmentId });

    return { studentId: student.id, credentials, enrolledId };
  });

  // Saved — email the new student if they are already enrolled.
  if (result.enrolledId) {
    const enrollmentId = result.enrolledId;
    notifyLater("enrollment confirmed", () => notifyEnrollmentConfirmed(enrollmentId));
  }

  return { student: await loadStudentDetail(result.studentId), credentials: result.credentials };
}

// --- Update ------------------------------------------------------------------

const TRACKED_FIELDS = ["firstName", "middleName", "lastName", "suffix", "sex", "programId", "status"] as const;

export async function updateStudent(id: number, input: UpdateStudentInput, actor: Actor) {
  const current = await studentRepository.findStudentById(id);
  if (!current) throw AppError.notFound("Student not found.");
  if (current.status === "ARCHIVED") throw AppError.badRequest("Restore this student before editing the record.");

  const program = await prisma.program.findUnique({ where: { id: input.programId } });
  if (!program) throw AppError.validation({ programId: "Program not found." });

  // Record WHICH fields changed (not their values) to keep audit logs privacy-friendly.
  const changed: string[] = TRACKED_FIELDS.filter((field) => {
    const next = input[field as keyof UpdateStudentInput];
    return next !== undefined && next !== current[field];
  });
  if (current.dateOfBirth.toISOString().slice(0, 10) !== input.dateOfBirth) changed.push("dateOfBirth");
  const profileBefore = toStudentProfileDto(current.profile);
  const profileKeys = Object.keys(profileBefore) as Array<keyof typeof profileBefore>;
  if (profileKeys.some((key) => profileBefore[key] !== input.profile[key])) changed.push("profile");

  await prisma.$transaction(async (tx) => {
    await studentRepository.updateStudent(
      id,
      {
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        suffix: input.suffix,
        dateOfBirth: fromDateOnlyString(input.dateOfBirth),
        sex: input.sex,
        programId: input.programId,
        ...(input.status ? { status: input.status } : {}),
      },
      tx,
    );
    await studentRepository.upsertStudentProfile(id, input.profile, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.STUDENT_UPDATED,
        entityType: "student",
        entityId: id,
        description: `Updated student record ${current.studentNumber}${changed.length ? ` (${changed.join(", ")})` : ""}`,
        metadata: { changedFields: changed },
      },
      tx,
    );
  });

  return loadStudentDetail(id);
}

// --- Archive / restore -------------------------------------------------------

export async function archiveStudent(id: number, actor: Actor) {
  const student = await studentRepository.findStudentById(id);
  if (!student) throw AppError.notFound("Student not found.");
  if (student.status === "ARCHIVED") throw AppError.badRequest("This student is already archived.");

  await prisma.$transaction(async (tx) => {
    await studentRepository.updateStudent(id, { status: "ARCHIVED", archivedAt: new Date() }, tx);
    if (student.userId) {
      // Archived students lose portal access immediately.
      await tx.user.update({ where: { id: student.userId }, data: { isActive: false } });
      await sessionRepository.deleteUserSessions(student.userId, undefined, tx);
    }
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.STUDENT_ARCHIVED,
        entityType: "student",
        entityId: id,
        description: `Archived student ${student.studentNumber} ${fullName(student)}`,
      },
      tx,
    );
  });
  return loadStudentDetail(id);
}

export async function restoreStudent(id: number, actor: Actor) {
  const student = await studentRepository.findStudentById(id);
  if (!student) throw AppError.notFound("Student not found.");
  if (student.status !== "ARCHIVED") throw AppError.badRequest("This student is not archived.");

  await prisma.$transaction(async (tx) => {
    await studentRepository.updateStudent(id, { status: "ACTIVE", archivedAt: null }, tx);
    if (student.userId) await tx.user.update({ where: { id: student.userId }, data: { isActive: true } });
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.STUDENT_RESTORED,
        entityType: "student",
        entityId: id,
        description: `Restored student ${student.studentNumber} ${fullName(student)}`,
      },
      tx,
    );
  });
  return loadStudentDetail(id);
}
