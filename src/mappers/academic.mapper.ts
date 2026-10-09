// API shapes for academic reference data.
import type {
  AcademicYear,
  Instructor,
  Program,
  Room,
  Section,
  Semester,
  Subject,
} from "../generated/prisma/client";
import { toDateOnlyOrNull, toDateOnlyString } from "../utils/dates";
import { allowedYearLevels } from "../utils/year-levels";

export function toProgramDto(program: Program) {
  return {
    id: program.id,
    code: program.code,
    name: program.name,
    level: program.level,
    description: program.description,
    durationYears: program.durationYears,
    /** e.g. [11, 12] for Senior High, [1, 2] for a 2-year college program. */
    yearLevels: allowedYearLevels(program),
    isActive: program.isActive,
  };
}

export function toSemesterDto(semester: Semester & { academicYear?: AcademicYear }) {
  return {
    id: semester.id,
    academicYearId: semester.academicYearId,
    academicYearName: semester.academicYear?.name ?? null,
    name: semester.name,
    termNumber: semester.termNumber,
    startDate: toDateOnlyOrNull(semester.startDate),
    endDate: toDateOnlyOrNull(semester.endDate),
    isCurrent: semester.isCurrent,
    /** e.g. "First Semester, 2026-2027" */
    label: semester.academicYear ? `${semester.name}, ${semester.academicYear.name}` : semester.name,
  };
}

export function toAcademicYearDto(year: AcademicYear & { semesters?: Semester[] }) {
  return {
    id: year.id,
    name: year.name,
    startDate: toDateOnlyString(year.startDate),
    endDate: toDateOnlyString(year.endDate),
    semesters: (year.semesters ?? [])
      .sort((a, b) => a.termNumber - b.termNumber)
      .map((semester) => toSemesterDto({ ...semester, academicYear: year })),
  };
}

export function toSectionDto(section: Section & { program?: Program; academicYear?: AcademicYear }) {
  return {
    id: section.id,
    name: section.name,
    programId: section.programId,
    programCode: section.program?.code ?? null,
    yearLevel: section.yearLevel,
    academicYearId: section.academicYearId,
    academicYearName: section.academicYear?.name ?? null,
  };
}

export function toSubjectDto(subject: Subject) {
  return {
    id: subject.id,
    code: subject.code,
    name: subject.name,
    units: Number(subject.units),
    description: subject.description,
    isActive: subject.isActive,
  };
}

export function toInstructorDto(instructor: Instructor) {
  return {
    id: instructor.id,
    employeeNumber: instructor.employeeNumber,
    firstName: instructor.firstName,
    lastName: instructor.lastName,
    fullName: `${instructor.firstName} ${instructor.lastName}`,
    email: instructor.email,
    isActive: instructor.isActive,
    /** True when a TEACHER account is linked (User Accounts). */
    hasAccount: instructor.userId !== null,
  };
}

export function toRoomDto(room: Room) {
  return { id: room.id, code: room.code, name: room.name, capacity: room.capacity, isActive: room.isActive };
}
