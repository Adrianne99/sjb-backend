// Database access for students and their profiles.
import { prisma, type DbClient } from "../config/database";
import type { EnrollmentStatus, Prisma, StudentStatus } from "../generated/prisma/client";

export interface ListStudentsFilters {
  search?: string;
  programId?: number;
  status?: StudentStatus;
  /** These three filter on the student's enrollment in `semesterId` (the current term). */
  semesterId?: number;
  yearLevel?: number;
  sectionId?: number;
  enrollmentStatus?: EnrollmentStatus;
  skip: number;
  take: number;
}

/** "juan dela cruz" -> every word must match the number, first, middle or last name. */
function buildSearchFilter(search?: string): Prisma.StudentWhereInput {
  if (!search) return {};
  const words = search.split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    AND: words.map((word) => ({
      OR: [
        { studentNumber: { contains: word } },
        { firstName: { contains: word } },
        { middleName: { contains: word } },
        { lastName: { contains: word } },
      ],
    })),
  };
}

export async function listStudents(filters: ListStudentsFilters) {
  const termFilter: Prisma.EnrollmentWhereInput = {
    ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
    ...(filters.yearLevel ? { yearLevel: filters.yearLevel } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.enrollmentStatus ? { status: filters.enrollmentStatus } : {}),
  };
  const filtersByTerm = Boolean(filters.yearLevel || filters.sectionId || filters.enrollmentStatus);

  const where: Prisma.StudentWhereInput = {
    ...buildSearchFilter(filters.search),
    ...(filters.programId ? { programId: filters.programId } : {}),
    // Archived students are hidden unless explicitly requested.
    status: filters.status ?? { not: "ARCHIVED" },
    ...(filtersByTerm ? { enrollments: { some: termFilter } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        program: true,
        user: { select: { id: true, isActive: true } },
        enrollments: {
          where: filters.semesterId ? { semesterId: filters.semesterId } : undefined,
          include: { section: true, _count: { select: { extraSubjects: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.student.count({ where }),
  ]);

  return { items, total };
}

export const studentDetailInclude = {
  program: true,
  profile: true,
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      lockedUntil: true,
      createdAt: true,
    },
  },
  enrollments: {
    include: { semester: { include: { academicYear: true } }, section: true, program: true },
    orderBy: [{ semester: { academicYear: { startDate: "desc" } } }, { semester: { termNumber: "desc" } }],
  },
} satisfies Prisma.StudentInclude;

export type StudentDetail = Prisma.StudentGetPayload<{ include: typeof studentDetailInclude }>;

export function findStudentDetail(id: number, db: DbClient = prisma) {
  return db.student.findUnique({ where: { id }, include: studentDetailInclude });
}

export function findStudentById(id: number, db: DbClient = prisma) {
  return db.student.findUnique({ where: { id }, include: { program: true, profile: true } });
}

export function studentNumberExists(studentNumber: string, db: DbClient = prisma) {
  return db.student.count({ where: { studentNumber } }).then((count) => count > 0);
}

/** Highest existing number for a year prefix, e.g. "2026-0042". */
export function findLatestStudentNumber(prefix: string, db: DbClient = prisma) {
  return db.student.findFirst({
    where: { studentNumber: { startsWith: `${prefix}-` } },
    orderBy: { studentNumber: "desc" },
    select: { studentNumber: true },
  });
}

export function createStudent(data: Prisma.StudentUncheckedCreateInput, db: DbClient = prisma) {
  return db.student.create({ data, include: { program: true, profile: true } });
}

export function updateStudent(id: number, data: Prisma.StudentUncheckedUpdateInput, db: DbClient = prisma) {
  return db.student.update({ where: { id }, data, include: { program: true, profile: true } });
}

export function upsertStudentProfile(
  studentId: number,
  data: Omit<Prisma.StudentProfileUncheckedCreateInput, "studentId">,
  db: DbClient = prisma,
) {
  return db.studentProfile.upsert({ where: { studentId }, create: { studentId, ...data }, update: data });
}
