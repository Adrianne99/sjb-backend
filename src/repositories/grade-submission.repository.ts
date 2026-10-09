// Database access for teachers' "Submit for review" (table: grade_submissions).
// One row per class = term + section + subject.
import { prisma, type DbClient } from "../config/database";
import type { GradeSubmissionStatus } from "../generated/prisma/client";

export interface ClassKey {
  semesterId: number;
  sectionId: number;
  subjectId: number;
}

const include = {
  submittedBy: { include: { staffProfile: true } },
  reviewedBy: { include: { staffProfile: true } },
  instructor: { include: { user: true } },
  subject: true,
  section: true,
  semester: { include: { academicYear: true } },
} as const;

/** Only the three key fields (callers may pass a bigger object, e.g. a save request). */
const keyOf = (key: ClassKey): ClassKey => ({ semesterId: key.semesterId, sectionId: key.sectionId, subjectId: key.subjectId });

export function findSubmission(key: ClassKey, db: DbClient = prisma) {
  return db.gradeSubmission.findUnique({ where: { semesterId_sectionId_subjectId: keyOf(key) }, include });
}

export function listSubmissionsForTerm(semesterId: number) {
  return prisma.gradeSubmission.findMany({ where: { semesterId }, include });
}

export function listSubmissionsByStatus(status: GradeSubmissionStatus) {
  return prisma.gradeSubmission.findMany({ where: { status }, include, orderBy: { submittedAt: "asc" } });
}

/** Creates the submission, or re-submits a RETURNED one. */
export function saveSubmission(key: ClassKey, data: { instructorId: number; submittedById: number }, db: DbClient = prisma) {
  const fresh = { status: "SUBMITTED" as const, submittedAt: new Date(), reviewedById: null, reviewedAt: null, note: null, ...data };
  return db.gradeSubmission.upsert({
    where: { semesterId_sectionId_subjectId: keyOf(key) },
    create: { ...keyOf(key), ...fresh },
    update: fresh,
    include,
  });
}

export function reviewSubmission(id: number, data: { status: GradeSubmissionStatus; reviewedById: number; note?: string | null }, db: DbClient = prisma) {
  return db.gradeSubmission.update({
    where: { id },
    data: { status: data.status, reviewedById: data.reviewedById, reviewedAt: new Date(), note: data.note ?? null },
    include,
  });
}

export type SubmissionRow = NonNullable<Awaited<ReturnType<typeof findSubmission>>>;
