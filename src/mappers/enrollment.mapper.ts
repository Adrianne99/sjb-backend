import type { AcademicYear, Enrollment, Program, Section, Semester, Student } from "../generated/prisma/client";
import { toDateOnlyString } from "../utils/dates";
import { toStudentSummaryDto } from "./student.mapper";

type EnrollmentWithRelations = Enrollment & {
  semester: Semester & { academicYear: AcademicYear };
  section: Section | null;
  program: Program;
  student?: Student & { program?: Program };
};

export function toEnrollmentDto(enrollment: EnrollmentWithRelations) {
  return {
    id: enrollment.id,
    studentId: enrollment.studentId,
    semesterId: enrollment.semesterId,
    academicYearId: enrollment.semester.academicYearId,
    academicYearName: enrollment.semester.academicYear.name,
    semesterName: enrollment.semester.name,
    termLabel: `${enrollment.semester.name}, ${enrollment.semester.academicYear.name}`,
    isCurrentTerm: enrollment.semester.isCurrent,
    programId: enrollment.programId,
    programCode: enrollment.program.code,
    programName: enrollment.program.name,
    yearLevel: enrollment.yearLevel,
    sectionId: enrollment.sectionId,
    sectionName: enrollment.section?.name ?? null,
    enrollmentDate: toDateOnlyString(enrollment.enrollmentDate),
    status: enrollment.status,
    remarks: enrollment.remarks,
    createdAt: enrollment.createdAt.toISOString(),
    student: enrollment.student ? toStudentSummaryDto(enrollment.student) : undefined,
  };
}
