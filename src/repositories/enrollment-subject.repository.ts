// Database access for irregular students' extra subjects (classes taken with
// another section).
import { prisma, type DbClient } from "../config/database";

const include = {
  subject: true,
  section: { include: { program: true } },
} as const;

export function findExtraSubjects(enrollmentId: number, db: DbClient = prisma) {
  return db.enrollmentSubject.findMany({ where: { enrollmentId }, include, orderBy: { createdAt: "asc" } });
}

export function findExtraSubjectById(id: number) {
  return prisma.enrollmentSubject.findUnique({ where: { id }, include });
}

export function findExtraSubject(enrollmentId: number, subjectId: number, db: DbClient = prisma) {
  return db.enrollmentSubject.findUnique({ where: { enrollmentId_subjectId: { enrollmentId, subjectId } }, include });
}

export function createExtraSubject(data: { enrollmentId: number; sectionId: number; subjectId: number; createdById: number | null }, db: DbClient = prisma) {
  return db.enrollmentSubject.create({ data, include });
}

export function deleteExtraSubject(id: number) {
  return prisma.enrollmentSubject.delete({ where: { id } });
}

/** How many irregular students joined each class (section + subject) in a term. */
export function countExtraStudentsPerClass(semesterId: number) {
  return prisma.enrollmentSubject.groupBy({
    by: ["sectionId", "subjectId"],
    where: { enrollment: { semesterId, status: { in: ["ENROLLED", "COMPLETED"] } } },
    _count: { _all: true },
  });
}
