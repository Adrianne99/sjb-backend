// Database access for enrollments and tuition assessments (charges).
import { prisma, type DbClient } from "../config/database";
import type { EnrollmentStatus, Prisma } from "../generated/prisma/client";

export const enrollmentInclude = {
  semester: { include: { academicYear: true } },
  section: true,
  program: true,
  student: { include: { program: true } },
} satisfies Prisma.EnrollmentInclude;

export type EnrollmentWithRelations = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

export interface ListEnrollmentsFilters {
  search?: string;
  semesterId?: number;
  academicYearId?: number;
  programId?: number;
  yearLevel?: number;
  sectionId?: number;
  status?: EnrollmentStatus;
  studentId?: number;
  skip: number;
  take: number;
}

export async function listEnrollments(filters: ListEnrollmentsFilters) {
  const words = filters.search?.split(/\s+/).filter(Boolean).slice(0, 5) ?? [];
  const where: Prisma.EnrollmentWhereInput = {
    ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
    ...(filters.academicYearId ? { semester: { academicYearId: filters.academicYearId } } : {}),
    ...(filters.programId ? { programId: filters.programId } : {}),
    ...(filters.yearLevel ? { yearLevel: filters.yearLevel } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(words.length
      ? {
          AND: words.map((word) => ({
            student: {
              OR: [
                { studentNumber: { contains: word } },
                { firstName: { contains: word } },
                { lastName: { contains: word } },
              ],
            },
          })),
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      include: enrollmentInclude,
      orderBy: [{ enrollmentDate: "desc" }, { id: "desc" }],
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.enrollment.count({ where }),
  ]);
  return { items, total };
}

export function findEnrollmentById(id: number, db: DbClient = prisma) {
  return db.enrollment.findUnique({ where: { id }, include: enrollmentInclude });
}

export function findEnrollmentForStudentAndTerm(studentId: number, semesterId: number, db: DbClient = prisma) {
  return db.enrollment.findUnique({ where: { studentId_semesterId: { studentId, semesterId } } });
}

export function findEnrollmentsByStudent(studentId: number) {
  return prisma.enrollment.findMany({
    where: { studentId },
    include: enrollmentInclude,
    orderBy: [{ semester: { academicYear: { startDate: "desc" } } }, { semester: { termNumber: "desc" } }],
  });
}

export function createEnrollment(data: Prisma.EnrollmentUncheckedCreateInput, db: DbClient = prisma) {
  return db.enrollment.create({ data, include: enrollmentInclude });
}

export function updateEnrollment(id: number, data: Prisma.EnrollmentUncheckedUpdateInput, db: DbClient = prisma) {
  return db.enrollment.update({ where: { id }, data, include: enrollmentInclude });
}

export function findRecentEnrollments(take: number) {
  return prisma.enrollment.findMany({ include: enrollmentInclude, orderBy: { createdAt: "desc" }, take });
}

// --- Assessments -------------------------------------------------------------

export function findAssessmentsForEnrollment(enrollmentId: number) {
  return prisma.tuitionAssessment.findMany({ where: { enrollmentId }, orderBy: { createdAt: "asc" } });
}

export function findAssessmentById(id: number) {
  return prisma.tuitionAssessment.findUnique({ where: { id }, include: { enrollment: { include: enrollmentInclude } } });
}

export function createAssessment(data: Prisma.TuitionAssessmentUncheckedCreateInput, db: DbClient = prisma) {
  return db.tuitionAssessment.create({ data });
}

export function updateAssessment(id: number, data: Prisma.TuitionAssessmentUncheckedUpdateInput) {
  return prisma.tuitionAssessment.update({ where: { id }, data });
}
