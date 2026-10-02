// The student portal (/api/me/*). Every function receives the student ID from
// the logged-in session — never from the URL — so a student can only ever see
// their own records.
import { prisma } from "../../config/database";
import type { DayOfWeek } from "../../generated/prisma/client";
import { toStudentPaymentDto } from "../../mappers/payment.mapper";
import { toScheduleDto } from "../../mappers/schedule.mapper";
import { toStudentPersonalDto, toStudentProfileDto, toStudentSummaryDto } from "../../mappers/student.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import * as paymentRepository from "../../repositories/payment.repository";
import * as scheduleRepository from "../../repositories/schedule.repository";
import * as studentRepository from "../../repositories/student.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { nowInManila } from "../../utils/dates";
import type { StudentProfileInput } from "../../validators/student.validators";
import type { StudentProfileField } from "../../validators/settings.validators";
import { listStudentAnnouncements } from "../announcements/announcement.service";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { getAcademicHistory } from "../grades/report-card.service";
import { getStudentEditableFields } from "../settings/settings.service";
import { getStudentStatement } from "../payments/balance.service";

const WEEK: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

async function loadStudent(studentId: number) {
  const student = await studentRepository.findStudentDetail(studentId);
  if (!student) throw AppError.notFound("Student record not found.");
  return student;
}

async function findCurrentEnrollment(studentId: number) {
  const term = await academicRepository.findCurrentSemester();
  if (!term) return { term: null, enrollment: null };
  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_semesterId: { studentId, semesterId: term.id } },
    include: { section: true, program: true },
  });
  return { term, enrollment };
}

/**
 * The student's weekly classes in a term: their section's classes plus any
 * extra subjects taken with other sections (irregular students).
 */
async function findSectionSchedule(studentId: number, semesterId?: number) {
  const term = semesterId ? await academicRepository.findSemesterById(semesterId) : await academicRepository.findCurrentSemester();
  if (!term) return { term: null, sectionName: null, slots: [] };

  const enrollment = await prisma.enrollment.findUnique({
    where: { studentId_semesterId: { studentId, semesterId: term.id } },
    include: { section: true, extraSubjects: true },
  });
  if (!enrollment || !["ENROLLED", "COMPLETED"].includes(enrollment.status)) {
    return { term, sectionName: enrollment?.section?.name ?? null, slots: [] };
  }
  const slots = await scheduleRepository.findSlotsForStudent(term.id, enrollment.sectionId, enrollment.extraSubjects);
  return { term, sectionName: enrollment.section?.name ?? null, slots };
}

/** The next class from now (today later, or the next day that has one). */
function pickNextClass(slots: Awaited<ReturnType<typeof scheduleRepository.listSchedules>>) {
  if (slots.length === 0) return null;
  const now = nowInManila();
  const todayIndex = WEEK.indexOf(now.dayOfWeek);

  for (let offset = 0; offset < 7; offset++) {
    const day = WEEK[(todayIndex + offset) % 7];
    const candidates = slots.filter((slot) => slot.dayOfWeek === day && (offset > 0 || slot.endTime > now.time));
    if (candidates.length) {
      const slot = candidates.sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
      return { ...toScheduleDto(slot), isToday: offset === 0, isOngoing: offset === 0 && slot.startTime <= now.time };
    }
  }
  return null;
}

export async function getOverview(studentId: number) {
  const [student, { term, enrollment }, history, statement, schedule, announcements] = await Promise.all([
    loadStudent(studentId),
    findCurrentEnrollment(studentId),
    getAcademicHistory(studentId, { publishedOnly: true }),
    getStudentStatement(studentId),
    findSectionSchedule(studentId),
    listStudentAnnouncements(3),
  ]);

  const currentTermGrades = history.years
    .flatMap((year) => year.terms)
    .find((entry) => entry.semesterId === term?.id);

  let academicStatus: { label: string; tone: "neutral" | "success" | "warning" };
  if (!currentTermGrades || currentTermGrades.subjects.length === 0) {
    academicStatus = { label: "No grades published yet for this term", tone: "neutral" };
  } else if (currentTermGrades.failedCount > 0) {
    academicStatus = { label: `${currentTermGrades.failedCount} subject(s) with a failing grade`, tone: "warning" };
  } else {
    const incomplete = currentTermGrades.subjects.filter((subject) => subject.remark === "INCOMPLETE").length;
    academicStatus = incomplete
      ? { label: `${incomplete} subject(s) marked incomplete`, tone: "warning" }
      : { label: "All published subjects passed", tone: "success" };
  }

  return {
    student: { ...toStudentSummaryDto(student), programName: student.program.name },
    currentTerm: term ? { id: term.id, label: `${term.name}, ${term.academicYear.name}` } : null,
    currentEnrollment: enrollment
      ? { status: enrollment.status, yearLevel: enrollment.yearLevel, sectionName: enrollment.section?.name ?? null }
      : null,
    gradingScale: history.gradingScale,
    overallAverage: history.overallAverageDisplay,
    currentTermAverage: currentTermGrades?.averageDisplay ?? null,
    balance: { totalAssessed: statement.totalAssessed, totalPaid: statement.totalPaid, balance: statement.balance },
    nextClass: pickNextClass(schedule.slots),
    academicStatus,
    announcements,
  };
}

export async function getProfile(studentId: number) {
  const [student, editableFields, { enrollment }] = await Promise.all([
    loadStudent(studentId),
    getStudentEditableFields(),
    findCurrentEnrollment(studentId),
  ]);
  return {
    ...toStudentSummaryDto(student),
    ...toStudentPersonalDto(student),
    programName: student.program.name,
    yearLevel: enrollment?.yearLevel ?? student.enrollments[0]?.yearLevel ?? null,
    sectionName: enrollment?.section?.name ?? null,
    profile: toStudentProfileDto(student.profile),
    editableFields,
  };
}

/**
 * Students may update ONLY the fields an administrator has allowed.
 * Any attempt to change another field is rejected outright.
 */
export async function updateProfile(studentId: number, input: Partial<StudentProfileInput>, actor: Actor) {
  const editableFields = await getStudentEditableFields();
  const requested = Object.keys(input) as StudentProfileField[];
  const blocked = requested.filter((field) => !editableFields.includes(field));
  if (blocked.length) {
    throw AppError.forbidden(`You are not allowed to change: ${blocked.join(", ")}.`);
  }
  if (requested.length === 0) throw AppError.badRequest("Nothing to update.");

  const student = await loadStudent(studentId);
  await studentRepository.upsertStudentProfile(studentId, input);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.PROFILE_UPDATED,
    entityType: "student",
    entityId: studentId,
    description: `${student.studentNumber} updated their contact details (${requested.join(", ")})`,
    metadata: { changedFields: requested },
  });
  return getProfile(studentId);
}

export async function getSchedule(studentId: number, semesterId?: number) {
  const { term, sectionName, slots } = await findSectionSchedule(studentId, semesterId);
  return {
    term: term ? { id: term.id, label: `${term.name}, ${term.academicYear.name}` } : null,
    sectionName,
    slots: slots.map(toScheduleDto),
  };
}

export function getBalance(studentId: number) {
  return getStudentStatement(studentId);
}

export async function getPaymentHistory(studentId: number) {
  return (await paymentRepository.findPaymentsForStudent(studentId)).map(toStudentPaymentDto);
}

export async function getNotificationPreferences(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { notifyAnnouncements: user.notifyAnnouncements, notifyAccountActivity: user.notifyAccountActivity, notifySchoolRecords: user.notifySchoolRecords };
}

export async function updateNotificationPreferences(
  userId: number,
  input: { notifyAnnouncements: boolean; notifyAccountActivity: boolean; notifySchoolRecords?: boolean },
) {
  await prisma.user.update({ where: { id: userId }, data: input });
  return getNotificationPreferences(userId);
}
