import type { GradeWithRelations } from "../repositories/grade.repository";
import type { GradingConfig } from "../validators/settings.validators";
import { toStudentSummaryDto } from "./student.mapper";

export function formatGrade(grade: number | null, config: GradingConfig): string | null {
  return grade === null ? null : grade.toFixed(config.decimalPlaces);
}

/** Grade as seen by staff (includes who encoded/published it). */
export function toGradeDto(grade: GradeWithRelations, config: GradingConfig) {
  const value = grade.grade === null ? null : Number(grade.grade);
  return {
    id: grade.id,
    enrollmentId: grade.enrollmentId,
    semesterId: grade.enrollment.semesterId,
    termLabel: `${grade.enrollment.semester.name}, ${grade.enrollment.semester.academicYear.name}`,
    sectionId: grade.enrollment.sectionId,
    sectionName: grade.enrollment.section?.name ?? null,
    subject: {
      id: grade.subject.id,
      code: grade.subject.code,
      name: grade.subject.name,
      units: Number(grade.subject.units),
    },
    instructorName: grade.instructor ? `${grade.instructor.firstName} ${grade.instructor.lastName}` : null,
    grade: value,
    gradeDisplay: formatGrade(value, config),
    remark: grade.remark,
    status: grade.status,
    encodedAt: grade.encodedAt.toISOString(),
    encodedBy: grade.encodedBy.username,
    updatedAt: grade.updatedAt.toISOString(),
    publishedAt: grade.publishedAt?.toISOString() ?? null,
    publishedBy: grade.publishedBy?.username ?? null,
    student: toStudentSummaryDto(grade.enrollment.student),
  };
}

/** Grade as seen by the student (published only, no staff details). */
export function toStudentGradeDto(grade: GradeWithRelations, config: GradingConfig) {
  const value = grade.grade === null ? null : Number(grade.grade);
  return {
    id: grade.id,
    subjectCode: grade.subject.code,
    subjectName: grade.subject.name,
    units: Number(grade.subject.units),
    instructorName: grade.instructor ? `${grade.instructor.firstName} ${grade.instructor.lastName}` : null,
    grade: value,
    gradeDisplay: formatGrade(value, config),
    remark: grade.remark,
    status: grade.status,
  };
}
