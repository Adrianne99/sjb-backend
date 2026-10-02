// Database access for grades.
import { prisma, type DbClient } from "../config/database";
import type { GradeStatus, Prisma } from "../generated/prisma/client";

export const gradeInclude = {
  subject: true,
  instructor: true,
  encodedBy: { select: { id: true, username: true } },
  publishedBy: { select: { id: true, username: true } },
  enrollment: {
    include: {
      student: { include: { program: true } },
      semester: { include: { academicYear: true } },
      section: true,
      program: true,
    },
  },
} satisfies Prisma.GradeInclude;

export type GradeWithRelations = Prisma.GradeGetPayload<{ include: typeof gradeInclude }>;

export interface ListGradesFilters {
  semesterId?: number;
  academicYearId?: number;
  subjectId?: number;
  sectionId?: number;
  status?: GradeStatus;
  studentId?: number;
  search?: string;
  skip: number;
  take: number;
}

export async function listGrades(filters: ListGradesFilters) {
  const words = filters.search?.split(/\s+/).filter(Boolean).slice(0, 5) ?? [];
  const where: Prisma.GradeWhereInput = {
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    enrollment: {
      ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
      ...(filters.academicYearId ? { semester: { academicYearId: filters.academicYearId } } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(words.length
        ? {
            AND: words.map((word) => ({
              student: {
                OR: [{ studentNumber: { contains: word } }, { firstName: { contains: word } }, { lastName: { contains: word } }],
              },
            })),
          }
        : {}),
    },
  };

  const [items, total] = await Promise.all([
    prisma.grade.findMany({ where, include: gradeInclude, orderBy: { updatedAt: "desc" }, skip: filters.skip, take: filters.take }),
    prisma.grade.count({ where }),
  ]);
  return { items, total };
}

export function findGradeById(id: number, db: DbClient = prisma) {
  return db.grade.findUnique({ where: { id }, include: gradeInclude });
}

export function findGradeForEnrollmentSubject(enrollmentId: number, subjectId: number, db: DbClient = prisma) {
  return db.grade.findUnique({ where: { enrollmentId_subjectId: { enrollmentId, subjectId } }, include: gradeInclude });
}

export function createGrade(data: Prisma.GradeUncheckedCreateInput, db: DbClient = prisma) {
  return db.grade.create({ data, include: gradeInclude });
}

export function updateGrade(id: number, data: Prisma.GradeUncheckedUpdateInput, db: DbClient = prisma) {
  return db.grade.update({ where: { id }, data, include: gradeInclude });
}

export function publishGradesByIds(ids: number[], publishedById: number, db: DbClient = prisma) {
  return db.grade.updateMany({
    where: { id: { in: ids }, status: "DRAFT" },
    data: { status: "PUBLISHED", publishedById, publishedAt: new Date() },
  });
}

/**
 * Students of one class (subject + section) in a term, with their grade:
 * - regular students: enrolled in that section;
 * - irregular students: from another section but taking this subject here.
 */
export function findClassRoster(semesterId: number, sectionId: number, subjectId: number) {
  return prisma.enrollment.findMany({
    where: {
      semesterId,
      status: { in: ["ENROLLED", "COMPLETED"] },
      OR: [{ sectionId }, { extraSubjects: { some: { sectionId, subjectId } } }],
    },
    include: {
      student: { include: { program: true } },
      program: true,
      section: true,
      grades: { where: { subjectId }, include: gradeInclude },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  });
}

/** All grades of one student, grouped later by term. */
export function findGradesForStudent(studentId: number, options: { publishedOnly: boolean }) {
  return prisma.grade.findMany({
    where: { enrollment: { studentId }, ...(options.publishedOnly ? { status: "PUBLISHED" } : {}) },
    include: gradeInclude,
    orderBy: { subject: { code: "asc" } },
  });
}

export function findGradesForEnrollment(enrollmentId: number, options: { publishedOnly: boolean }) {
  return prisma.grade.findMany({
    where: { enrollmentId, ...(options.publishedOnly ? { status: "PUBLISHED" } : {}) },
    include: gradeInclude,
    orderBy: { subject: { code: "asc" } },
  });
}

export function findRecentGradeUpdates(take: number) {
  return prisma.grade.findMany({ include: gradeInclude, orderBy: { updatedAt: "desc" }, take });
}
