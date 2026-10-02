// Academic history and report cards.
//
// Report cards are NOT stored separately — they are generated from the grades
// table (published grades only, for students). This keeps one source of truth.
//
// Each term uses the grading scale of that term's program level, so a student
// who moved from Senior High (60–100) to College (1.00–5.00) sees both correctly.
import { toStudentGradeDto } from "../../mappers/grade.mapper";
import { toStudentSummaryDto } from "../../mappers/student.mapper";
import * as enrollmentRepository from "../../repositories/enrollment.repository";
import * as gradeRepository from "../../repositories/grade.repository";
import { AppError } from "../../utils/app-error";
import type { GradingConfig } from "../../validators/settings.validators";
import { getGradingResolver } from "../settings/settings.service";
import { computeWeightedAverage } from "./grading";

type Grades = Awaited<ReturnType<typeof gradeRepository.findGradesForStudent>>;

function summarize(grades: Grades, config: GradingConfig) {
  const subjects = grades.map((grade) => toStudentGradeDto(grade, config));
  const average = computeWeightedAverage(
    subjects.map((subject) => ({ grade: subject.grade, units: subject.units })),
    config,
  );
  return {
    subjects,
    average,
    averageDisplay: average === null ? null : average.toFixed(config.decimalPlaces),
    totalUnits: subjects.reduce((sum, subject) => sum + subject.units, 0),
    passedCount: subjects.filter((subject) => subject.remark === "PASSED").length,
    failedCount: subjects.filter((subject) => subject.remark === "FAILED").length,
  };
}

type EnrollmentRow = Awaited<ReturnType<typeof enrollmentRepository.findEnrollmentsByStudent>>[number];

/** One term in the academic history: enrollment details + its grades. */
function buildTermEntry(enrollment: EnrollmentRow, grades: Grades, config: GradingConfig) {
  return {
    enrollmentId: enrollment.id,
    semesterId: enrollment.semesterId,
    semesterName: enrollment.semester.name,
    termNumber: enrollment.semester.termNumber,
    termLabel: `${enrollment.semester.name}, ${enrollment.semester.academicYear.name}`,
    isCurrent: enrollment.semester.isCurrent,
    enrollmentStatus: enrollment.status,
    programCode: enrollment.program.code,
    yearLevel: enrollment.yearLevel,
    sectionName: enrollment.section?.name ?? null,
    gradingScale: config.scaleLabel,
    ...summarize(grades.filter((grade) => grade.enrollmentId === enrollment.id), config),
  };
}

export type AcademicHistoryTerm = ReturnType<typeof buildTermEntry>;

/** Grades grouped as Academic Year -> Term -> Subjects. */
export async function getAcademicHistory(studentId: number, options: { publishedOnly: boolean }) {
  const [gradingFor, enrollments, grades] = await Promise.all([
    getGradingResolver(),
    enrollmentRepository.findEnrollmentsByStudent(studentId),
    gradeRepository.findGradesForStudent(studentId, options),
  ]);

  const years: Array<{ academicYearId: number; academicYearName: string; terms: AcademicHistoryTerm[] }> = [];

  for (const enrollment of enrollments) {
    let year = years.find((entry) => entry.academicYearId === enrollment.semester.academicYearId);
    if (!year) {
      year = { academicYearId: enrollment.semester.academicYearId, academicYearName: enrollment.semester.academicYear.name, terms: [] };
      years.push(year);
    }
    year.terms.push(buildTermEntry(enrollment, grades, gradingFor(enrollment.program.level)));
  }

  // Overall average: terms of the student's CURRENT level only (scales can't be mixed).
  const latestLevel = enrollments[0]?.program.level ?? null;
  const sameLevelIds = new Set(enrollments.filter((enrollment) => enrollment.program.level === latestLevel).map((enrollment) => enrollment.id));
  const config = gradingFor(latestLevel);
  const overall = summarize(grades.filter((grade) => sameLevelIds.has(grade.enrollmentId)), config);
  return {
    gradingScale: config.scaleLabel,
    overallAverage: overall.average,
    overallAverageDisplay: overall.averageDisplay,
    years,
  };
}

/** Report card for one enrollment (one student, one term). */
export async function getReportCardForEnrollment(enrollmentId: number, options: { publishedOnly: boolean }) {
  const enrollment = await enrollmentRepository.findEnrollmentById(enrollmentId);
  if (!enrollment) throw AppError.notFound("Enrollment not found.");

  const [gradingFor, grades] = await Promise.all([
    getGradingResolver(),
    gradeRepository.findGradesForEnrollment(enrollmentId, options),
  ]);
  const config = gradingFor(enrollment.program.level);

  return {
    enrollmentId: enrollment.id,
    student: {
      ...toStudentSummaryDto(enrollment.student),
      programName: enrollment.program.name,
      programCode: enrollment.program.code,
      yearLevel: enrollment.yearLevel,
      sectionName: enrollment.section?.name ?? null,
    },
    term: {
      semesterId: enrollment.semesterId,
      semesterName: enrollment.semester.name,
      academicYearName: enrollment.semester.academicYear.name,
      label: `${enrollment.semester.name}, ${enrollment.semester.academicYear.name}`,
    },
    enrollmentStatus: enrollment.status,
    gradingScale: config.scaleLabel,
    includesDrafts: !options.publishedOnly,
    generatedAt: new Date().toISOString(),
    ...summarize(grades, config),
  };
}

/**
 * The student's report card for a term. Without a term, picks the current term
 * if it has published grades, otherwise the latest term that does.
 */
export async function getStudentReportCard(studentId: number, semesterId?: number) {
  const enrollments = await enrollmentRepository.findEnrollmentsByStudent(studentId);
  const published = await gradeRepository.findGradesForStudent(studentId, { publishedOnly: true });
  const termsWithGrades = enrollments.filter((enrollment) => published.some((grade) => grade.enrollmentId === enrollment.id));

  const availableTerms = termsWithGrades.map((enrollment) => ({
    semesterId: enrollment.semesterId,
    label: `${enrollment.semester.name}, ${enrollment.semester.academicYear.name}`,
  }));

  const chosen = semesterId
    ? termsWithGrades.find((enrollment) => enrollment.semesterId === semesterId)
    : (termsWithGrades.find((enrollment) => enrollment.semester.isCurrent) ?? termsWithGrades[0]);

  if (!chosen) return { availableTerms, reportCard: null };
  return { availableTerms, reportCard: await getReportCardForEnrollment(chosen.id, { publishedOnly: true }) };
}
