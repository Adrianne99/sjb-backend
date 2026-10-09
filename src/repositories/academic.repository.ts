// Database access for academic reference data:
// programs, academic years, semesters, sections, subjects, instructors, rooms.
import { prisma, type DbClient } from "../config/database";
import type { Prisma } from "../generated/prisma/client";

// --- Programs ----------------------------------------------------------------
export const findPrograms = () => prisma.program.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }] });
export const findProgramById = (id: number) => prisma.program.findUnique({ where: { id } });
export const createProgram = (data: Prisma.ProgramCreateInput) => prisma.program.create({ data });
export const updateProgram = (id: number, data: Prisma.ProgramUpdateInput) => prisma.program.update({ where: { id }, data });

// --- Academic years & semesters ----------------------------------------------
export const findAcademicYears = () =>
  prisma.academicYear.findMany({ include: { semesters: true }, orderBy: { startDate: "desc" } });
export const findAcademicYearById = (id: number) =>
  prisma.academicYear.findUnique({ where: { id }, include: { semesters: true } });
export const createAcademicYear = (data: Prisma.AcademicYearCreateInput) =>
  prisma.academicYear.create({ data, include: { semesters: true } });
export const updateAcademicYear = (id: number, data: Prisma.AcademicYearUpdateInput) =>
  prisma.academicYear.update({ where: { id }, data, include: { semesters: true } });

export const findSemesterById = (id: number, db: DbClient = prisma) =>
  db.semester.findUnique({ where: { id }, include: { academicYear: true } });
export const createSemester = (data: Prisma.SemesterUncheckedCreateInput) =>
  prisma.semester.create({ data, include: { academicYear: true } });
export const updateSemester = (id: number, data: Prisma.SemesterUncheckedUpdateInput, db: DbClient = prisma) =>
  db.semester.update({ where: { id }, data, include: { academicYear: true } });
export const clearCurrentSemester = (db: DbClient = prisma) =>
  db.semester.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });

/** The term flagged as current, or the most recent one if none is flagged. */
export async function findCurrentSemester(db: DbClient = prisma) {
  const flagged = await db.semester.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
  if (flagged) return flagged;
  return db.semester.findFirst({
    include: { academicYear: true },
    orderBy: [{ academicYear: { startDate: "desc" } }, { termNumber: "desc" }],
  });
}

// --- Sections ----------------------------------------------------------------
export interface SectionFilters {
  academicYearId?: number;
  programId?: number;
  yearLevel?: number;
}
export const findSections = (filters: SectionFilters) =>
  prisma.section.findMany({
    where: filters,
    include: { program: true, academicYear: true },
    orderBy: [{ academicYear: { startDate: "desc" } }, { yearLevel: "asc" }, { name: "asc" }],
  });
export const findSectionById = (id: number, db: DbClient = prisma) =>
  db.section.findUnique({ where: { id }, include: { program: true, academicYear: true } });
export const createSection = (data: Prisma.SectionUncheckedCreateInput) =>
  prisma.section.create({ data, include: { program: true, academicYear: true } });
export const updateSection = (id: number, data: Prisma.SectionUncheckedUpdateInput) =>
  prisma.section.update({ where: { id }, data, include: { program: true, academicYear: true } });

/** How many records still point to a section (it can only be deleted when all are 0). */
export async function countSectionUsage(id: number) {
  const [enrollments, schedules, irregularStudents, gradeSubmissions, attendance] = await Promise.all([
    prisma.enrollment.count({ where: { sectionId: id } }),
    prisma.classSchedule.count({ where: { sectionId: id } }),
    prisma.enrollmentSubject.count({ where: { sectionId: id } }),
    prisma.gradeSubmission.count({ where: { sectionId: id } }),
    prisma.attendanceRecord.count({ where: { sectionId: id } }),
  ]);
  return { enrollments, schedules, irregularStudents, gradeSubmissions, attendance };
}
export const deleteSection = (id: number, db: DbClient = prisma) => db.section.delete({ where: { id } });

// --- Subjects ----------------------------------------------------------------
export const findSubjects = () => prisma.subject.findMany({ orderBy: { code: "asc" } });
export const findSubjectById = (id: number, db: DbClient = prisma) => db.subject.findUnique({ where: { id } });
export const createSubject = (data: Prisma.SubjectCreateInput) => prisma.subject.create({ data });
export const updateSubject = (id: number, data: Prisma.SubjectUpdateInput) => prisma.subject.update({ where: { id }, data });

// --- Instructors -------------------------------------------------------------
export const findInstructors = () => prisma.instructor.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
export const findInstructorById = (id: number, db: DbClient = prisma) => db.instructor.findUnique({ where: { id } });
export const createInstructor = (data: Prisma.InstructorCreateInput) => prisma.instructor.create({ data });
export const updateInstructor = (id: number, data: Prisma.InstructorUpdateInput) =>
  prisma.instructor.update({ where: { id }, data });

// --- Rooms -------------------------------------------------------------------
export const findRooms = () => prisma.room.findMany({ orderBy: { code: "asc" } });
export const findRoomById = (id: number, db: DbClient = prisma) => db.room.findUnique({ where: { id } });
export const createRoom = (data: Prisma.RoomCreateInput) => prisma.room.create({ data });
export const updateRoom = (id: number, data: Prisma.RoomUpdateInput) => prisma.room.update({ where: { id }, data });
