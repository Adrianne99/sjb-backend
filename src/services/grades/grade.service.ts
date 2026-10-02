// Grade encoding and publishing.
//
// Flow: term -> class (subject + section) -> students -> enter grades (DRAFT)
//       -> review -> PUBLISH (students can now see them).
// Rules:
// - A student can be graded in a subject that is scheduled for their own
//   section, or that they take with another section (irregular students).
// - Only ENROLLED / COMPLETED enrollments can receive grades.
// - Each grade uses the grading scale of the student's program level
//   (e.g. Senior High 60–100, College 1.00–5.00).
// - Changing a PUBLISHED grade (for example completing an INC) needs the
//   "grades:edit-published" permission and a reason. Every change is audited.
import { prisma } from "../../config/database";
import { toGradeDto } from "../../mappers/grade.mapper";
import { toScheduleDto } from "../../mappers/schedule.mapper";
import { toStudentSummaryDto } from "../../mappers/student.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import * as enrollmentSubjectRepository from "../../repositories/enrollment-subject.repository";
import * as enrollmentRepository from "../../repositories/enrollment.repository";
import * as gradeRepository from "../../repositories/grade.repository";
import * as scheduleRepository from "../../repositories/schedule.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { buildPaginationMeta, toSkipTake } from "../../utils/pagination";
import type {
  ClassSelector,
  CreateGradeInput,
  ListGradesQuery,
  SaveClassGradesInput,
  UpdateGradeInput,
} from "../../validators/grade.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { getGradingConfig, getGradingResolver } from "../settings/settings.service";
import { resolveGradeEntry } from "./grading";
import { notifyGradesPublished, notifyLater } from "../notifications/student-notifications.service";

const GRADEABLE_STATUSES = ["ENROLLED", "COMPLETED"];

async function getOfferingOrFail(selector: ClassSelector) {
  const offering = await scheduleRepository.findOffering(selector.semesterId, selector.sectionId, selector.subjectId);
  if (!offering) {
    throw AppError.validation({ subjectId: "This subject is not scheduled for that section in this term." });
  }
  return offering;
}

const describeGrade = (grade: number | null, remark: string) => (grade !== null ? String(grade) : remark);

// --- Read --------------------------------------------------------------------

export async function listGrades(query: ListGradesQuery) {
  const { page, pageSize, ...filters } = query;
  const [gradingFor, { items, total }] = await Promise.all([
    getGradingResolver(),
    gradeRepository.listGrades({ ...filters, ...toSkipTake({ page, pageSize }) }),
  ]);
  return {
    items: items.map((grade) => toGradeDto(grade, gradingFor(grade.enrollment.program.level))),
    meta: buildPaginationMeta({ page, pageSize }, total),
  };
}

/** Classes offered in a term with grade progress, for the "Select class" step. */
export async function listClasses(query: { semesterId?: number; sectionId?: number }) {
  const semesterId = query.semesterId ?? (await academicRepository.findCurrentSemester())?.id;
  if (!semesterId) return [];

  const [offerings, rosterCounts, extraCounts, grades] = await Promise.all([
    scheduleRepository.listOfferings(semesterId, query.sectionId),
    prisma.enrollment.groupBy({
      by: ["sectionId"],
      where: { semesterId, status: { in: ["ENROLLED", "COMPLETED"] } },
      _count: { _all: true },
    }),
    enrollmentSubjectRepository.countExtraStudentsPerClass(semesterId),
    prisma.grade.findMany({
      where: { enrollment: { semesterId } },
      select: {
        subjectId: true,
        status: true,
        enrollment: { select: { sectionId: true, extraSubjects: { select: { sectionId: true, subjectId: true } } } },
      },
    }),
  ]);

  return offerings.map((offering) => {
    // A grade belongs to this class if the student is in this section, or takes this subject here as an extra.
    const classGrades = grades.filter(
      (grade) =>
        grade.subjectId === offering.subjectId &&
        (grade.enrollment.sectionId === offering.sectionId ||
          grade.enrollment.extraSubjects.some((extra) => extra.sectionId === offering.sectionId && extra.subjectId === offering.subjectId)),
    );
    const regular = rosterCounts.find((row) => row.sectionId === offering.sectionId)?._count._all ?? 0;
    const irregular = extraCounts.find((row) => row.sectionId === offering.sectionId && row.subjectId === offering.subjectId)?._count._all ?? 0;
    const schedule = toScheduleDto(offering);
    return {
      semesterId,
      subject: schedule.subject,
      section: schedule.section,
      instructor: schedule.instructor,
      studentCount: regular + irregular,
      irregularCount: irregular,
      draftCount: classGrades.filter((grade) => grade.status === "DRAFT").length,
      publishedCount: classGrades.filter((grade) => grade.status === "PUBLISHED").length,
    };
  });
}

/** Students of one class with their current grade (if any). */
export async function getClassRoster(selector: ClassSelector) {
  const offering = await getOfferingOrFail(selector);
  const [gradingFor, roster] = await Promise.all([
    getGradingResolver(),
    gradeRepository.findClassRoster(selector.semesterId, selector.sectionId, selector.subjectId),
  ]);
  const schedule = toScheduleDto(offering);

  return {
    class: { termLabel: schedule.termLabel, subject: schedule.subject, section: schedule.section, instructor: schedule.instructor },
    gradingConfig: gradingFor(offering.section.program.level),
    students: roster.map((enrollment) => ({
      enrollmentId: enrollment.id,
      student: toStudentSummaryDto(enrollment.student),
      /** True when the student belongs to another section and takes only this subject here. */
      irregular: enrollment.sectionId !== selector.sectionId,
      homeSectionName: enrollment.section?.name ?? null,
      grade: enrollment.grades[0] ? toGradeDto(enrollment.grades[0], gradingFor(enrollment.program.level)) : null,
    })),
  };
}

/** Changes made to one grade, newest first (from the audit log). */
export async function getGradeHistory(id: number) {
  const grade = await gradeRepository.findGradeById(id);
  if (!grade) throw AppError.notFound("Grade not found.");
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "grade", entityId: String(id) },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
  });
  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    description: log.description,
    reason: (log.metadata as { reason?: string | null } | null)?.reason ?? null,
    user: log.user?.username ?? null,
    createdAt: log.createdAt.toISOString(),
  }));
}

// --- Create / update ---------------------------------------------------------

/** The class (section offering) in which this student takes the subject. */
async function findClassForStudent(enrollment: { id: number; semesterId: number; sectionId: number | null }, subjectId: number) {
  const extra = await enrollmentSubjectRepository.findExtraSubject(enrollment.id, subjectId);
  const sectionId = extra?.sectionId ?? enrollment.sectionId;
  if (!sectionId) throw AppError.badRequest("Assign the student to a section before encoding grades.");
  const offering = await scheduleRepository.findOffering(enrollment.semesterId, sectionId, subjectId);
  if (!offering) throw AppError.validation({ subjectId: "This student does not take this subject this term." });
  return offering;
}

export async function createGrade(input: CreateGradeInput, actor: Actor) {
  const enrollment = await enrollmentRepository.findEnrollmentById(input.enrollmentId);
  if (!enrollment) throw AppError.validation({ enrollmentId: "Enrollment not found." });
  if (!GRADEABLE_STATUSES.includes(enrollment.status)) {
    throw AppError.badRequest("Grades can only be encoded for students with an Enrolled or Completed status.");
  }

  const offering = await findClassForStudent(enrollment, input.subjectId);

  if (await gradeRepository.findGradeForEnrollmentSubject(enrollment.id, input.subjectId)) {
    throw AppError.conflict("A grade for this subject already exists. Edit the existing grade instead.");
  }

  const config = await getGradingConfig(enrollment.program.level);
  const entry = resolveGradeEntry(input, config);
  const grade = await prisma.$transaction(async (tx) => {
    const created = await gradeRepository.createGrade(
      {
        enrollmentId: enrollment.id,
        subjectId: input.subjectId,
        instructorId: offering.instructorId,
        grade: entry.grade,
        remark: entry.remark,
        encodedById: actor.userId!,
      },
      tx,
    );
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.GRADE_CREATED,
        entityType: "grade",
        entityId: created.id,
        description: `Encoded ${offering.subject.code} grade for ${enrollment.student.studentNumber}: ${describeGrade(entry.grade, entry.remark)} (draft)`,
      },
      tx,
    );
    return created;
  });

  return toGradeDto(grade, config);
}

/** Saves the whole grade sheet of a class. Published grades are left untouched. */
export async function saveClassGrades(input: SaveClassGradesInput, actor: Actor) {
  const gradingFor = await getGradingResolver();
  const offering = await getOfferingOrFail(input);
  const roster = await gradeRepository.findClassRoster(input.semesterId, input.sectionId, input.subjectId);
  const rosterById = new Map(roster.map((enrollment) => [enrollment.id, enrollment]));

  // Validate every row first so we either save all of them or none.
  const resolved = input.entries.map((entry, index) => {
    const enrollment = rosterById.get(entry.enrollmentId);
    if (!enrollment) {
      throw AppError.validation({ [`entries.${index}.enrollmentId`]: "This student is not enrolled in this class." });
    }
    return { enrollmentId: entry.enrollmentId, ...resolveGradeEntry(entry, gradingFor(enrollment.program.level), `entries.${index}.grade`) };
  });

  const changes: Array<{ enrollmentId: number; before: string | null; after: string }> = [];
  let created = 0;
  let updated = 0;
  let skippedPublished = 0;

  await prisma.$transaction(async (tx) => {
    for (const entry of resolved) {
      const existing = rosterById.get(entry.enrollmentId)!.grades[0];
      const after = describeGrade(entry.grade, entry.remark);

      if (!existing) {
        await gradeRepository.createGrade(
          {
            enrollmentId: entry.enrollmentId,
            subjectId: input.subjectId,
            instructorId: offering.instructorId,
            grade: entry.grade,
            remark: entry.remark,
            encodedById: actor.userId!,
          },
          tx,
        );
        created++;
        changes.push({ enrollmentId: entry.enrollmentId, before: null, after });
        continue;
      }

      // Published grades are changed one at a time, with a reason (see updateGrade).
      if (existing.status === "PUBLISHED") {
        skippedPublished++;
        continue;
      }

      const before = describeGrade(existing.grade === null ? null : Number(existing.grade), existing.remark);
      if (before === after && existing.remark === entry.remark) continue;

      await gradeRepository.updateGrade(
        existing.id,
        { grade: entry.grade, remark: entry.remark, encodedById: actor.userId!, encodedAt: new Date() },
        tx,
      );
      updated++;
      changes.push({ enrollmentId: entry.enrollmentId, before, after });
    }

    if (changes.length) {
      await recordAudit(
        actor,
        {
          action: updated ? AUDIT_ACTIONS.GRADE_UPDATED : AUDIT_ACTIONS.GRADE_CREATED,
          entityType: "grade_sheet",
          entityId: `${input.semesterId}:${input.sectionId}:${input.subjectId}`,
          description: `Saved draft grades for ${offering.subject.code} — ${offering.section.name} (${created} new, ${updated} changed)`,
          metadata: { changes },
        },
        tx,
      );
    }
  });

  return { created, updated, skippedPublished, roster: await getClassRoster(input) };
}

/**
 * Changes one grade. For a PUBLISHED grade (including completing an
 * INCOMPLETE) the user needs "grades:edit-published" and must give a reason.
 */
export async function updateGrade(id: number, input: UpdateGradeInput, actor: Actor, canEditPublished: boolean) {
  const existing = await gradeRepository.findGradeById(id);
  if (!existing) throw AppError.notFound("Grade not found.");

  if (existing.status === "PUBLISHED") {
    if (!canEditPublished) throw AppError.forbidden("You are not allowed to change published grades.");
    if (!input.reason) throw AppError.validation({ reason: "A reason is required when changing a published grade." });
  }

  const config = await getGradingConfig(existing.enrollment.program.level);
  const entry = resolveGradeEntry(input, config);
  const before = describeGrade(existing.grade === null ? null : Number(existing.grade), existing.remark);
  const after = describeGrade(entry.grade, entry.remark);
  const completesIncomplete = existing.remark === "INCOMPLETE" && entry.remark !== "INCOMPLETE";

  const grade = await prisma.$transaction(async (tx) => {
    const saved = await gradeRepository.updateGrade(
      id,
      { grade: entry.grade, remark: entry.remark, encodedById: actor.userId!, encodedAt: new Date() },
      tx,
    );
    const verb = completesIncomplete ? "Completed INC for" : "Changed";
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.GRADE_UPDATED,
        entityType: "grade",
        entityId: id,
        description: `${verb} ${existing.subject.code} grade of ${existing.enrollment.student.studentNumber}: ${before} → ${after}${input.reason ? ` (reason: ${input.reason})` : ""}`,
        metadata: { before, after, status: existing.status, reason: input.reason ?? null, completesIncomplete },
      },
      tx,
    );
    return saved;
  });

  return toGradeDto(grade, config);
}

// --- Publish -----------------------------------------------------------------

export async function publishGrade(id: number, actor: Actor) {
  const existing = await gradeRepository.findGradeById(id);
  if (!existing) throw AppError.notFound("Grade not found.");
  if (existing.status === "PUBLISHED") throw AppError.badRequest("This grade is already published.");

  await prisma.$transaction(async (tx) => {
    await gradeRepository.publishGradesByIds([id], actor.userId!, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.GRADE_PUBLISHED,
        entityType: "grade",
        entityId: id,
        description: `Published ${existing.subject.code} grade of ${existing.enrollment.student.studentNumber}`,
      },
      tx,
    );
  });

  // Saved — tell the student new grades are available (grade values are not emailed).
  notifyLater("grades published", () => notifyGradesPublished([id]));
  return toGradeDto((await gradeRepository.findGradeById(id))!, await getGradingConfig(existing.enrollment.program.level));
}

/** Publishes every DRAFT grade of a class. */
export async function publishClassGrades(selector: ClassSelector, actor: Actor) {
  const offering = await getOfferingOrFail(selector);
  const roster = await gradeRepository.findClassRoster(selector.semesterId, selector.sectionId, selector.subjectId);
  const draftIds = roster.flatMap((enrollment) => enrollment.grades).filter((grade) => grade.status === "DRAFT").map((grade) => grade.id);
  const withoutGrade = roster.filter((enrollment) => enrollment.grades.length === 0).length;

  if (draftIds.length === 0) throw AppError.badRequest("There are no draft grades to publish for this class.");

  await prisma.$transaction(async (tx) => {
    await gradeRepository.publishGradesByIds(draftIds, actor.userId!, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.GRADE_PUBLISHED,
        entityType: "grade_sheet",
        entityId: `${selector.semesterId}:${selector.sectionId}:${selector.subjectId}`,
        description: `Published ${draftIds.length} grade(s) for ${offering.subject.code} — ${offering.section.name}`,
        metadata: { gradeIds: draftIds },
      },
      tx,
    );
  });

  notifyLater("grades published", () => notifyGradesPublished(draftIds));
  return { published: draftIds.length, studentsWithoutGrade: withoutGrade };
}
