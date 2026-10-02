// API shapes for students.
import type { Program, Student, StudentProfile } from "../generated/prisma/client";
import { toDateOnlyString } from "../utils/dates";
import { formalName, fullName } from "../utils/person";

/** Small identity block reused by enrollments, grades and payments. */
export function toStudentSummaryDto(student: Student & { program?: Program }) {
  return {
    id: student.id,
    studentNumber: student.studentNumber,
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    suffix: student.suffix,
    fullName: fullName(student),
    formalName: formalName(student),
    status: student.status,
    programId: student.programId,
    programCode: student.program?.code ?? null,
    programName: student.program?.name ?? null,
  };
}

export function toStudentProfileDto(profile: StudentProfile | null) {
  return {
    email: profile?.email ?? null,
    contactNumber: profile?.contactNumber ?? null,
    addressLine: profile?.addressLine ?? null,
    barangay: profile?.barangay ?? null,
    city: profile?.city ?? null,
    province: profile?.province ?? null,
    zipCode: profile?.zipCode ?? null,
    guardianName: profile?.guardianName ?? null,
    guardianRelationship: profile?.guardianRelationship ?? null,
    guardianContactNumber: profile?.guardianContactNumber ?? null,
  };
}

export function toStudentPersonalDto(student: Student) {
  return {
    dateOfBirth: toDateOnlyString(student.dateOfBirth),
    sex: student.sex,
    createdAt: student.createdAt.toISOString(),
    archivedAt: student.archivedAt?.toISOString() ?? null,
  };
}
