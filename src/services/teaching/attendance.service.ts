// Class attendance (taken by the teacher): one mark per student per class meeting.
// A "class" is term + section + subject; a meeting is a date.
// The caller (teaching.service.ts) has already checked that the teacher teaches the class.
import { prisma } from "../../config/database";
import type { AttendanceStatus, DayOfWeek } from "../../generated/prisma/client";
import { toStudentSummaryDto } from "../../mappers/student.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import * as gradeRepository from "../../repositories/grade.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { fromDateOnlyString, toDateOnlyString, todayInManila } from "../../utils/dates";
import type { ClassSelector } from "../../validators/grade.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";

const WEEKDAYS: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const weekdayOf = (date: string) => WEEKDAYS[fromDateOnlyString(date).getUTCDay()];

/** A meeting date must not be in the future, and must fall within the term (when its dates are set). */
async function assertValidDate(semesterId: number, date: string) {
  if (date > todayInManila()) throw AppError.validation({ date: "You cannot take attendance for a future date." });
  const term = await academicRepository.findSemesterById(semesterId);
  const start = term?.startDate ? toDateOnlyString(term.startDate) : null;
  const end = term?.endDate ? toDateOnlyString(term.endDate) : null;
  if ((start && date < start) || (end && date > end)) {
    throw AppError.validation({ date: `Pick a date within the term${start && end ? ` (${start} to ${end})` : ""}.` });
  }
}

/** The days of the week this class meets, e.g. ["MONDAY", "WEDNESDAY"]. */
async function meetingDays(selector: ClassSelector) {
  const slots = await prisma.classSchedule.findMany({
    where: { semesterId: selector.semesterId, sectionId: selector.sectionId, subjectId: selector.subjectId },
    select: { dayOfWeek: true },
  });
  return [...new Set(slots.map((slot) => slot.dayOfWeek))];
}

const studentOf = (enrollment: Awaited<ReturnType<typeof gradeRepository.findClassRoster>>[number]) => {
  const { id, studentNumber, fullName, formalName } = toStudentSummaryDto(enrollment.student);
  return { id, studentNumber, fullName, formalName };
};

/** The class list for one date, with each student's mark (null = not taken yet). */
export async function getAttendanceSheet(selector: ClassSelector, date: string) {
  await assertValidDate(selector.semesterId, date);
  const [roster, records, days] = await Promise.all([
    gradeRepository.findClassRoster(selector.semesterId, selector.sectionId, selector.subjectId),
    prisma.attendanceRecord.findMany({
      where: { subjectId: selector.subjectId, sectionId: selector.sectionId, date: fromDateOnlyString(date) },
      select: { enrollmentId: true, status: true },
    }),
    meetingDays(selector),
  ]);

  return {
    date,
    meetingDays: days,
    /** False when the class does not normally meet on this weekday (still allowed, e.g. make-up classes). */
    meetsOnThisDay: days.includes(weekdayOf(date)),
    students: roster.map((enrollment) => ({
      enrollmentId: enrollment.id,
      student: studentOf(enrollment),
      irregular: enrollment.sectionId !== selector.sectionId,
      status: records.find((record) => record.enrollmentId === enrollment.id)?.status ?? null,
    })),
  };
}

/** Saves the marks for one date (creates or changes each student's mark). */
export async function saveAttendance(
  selector: ClassSelector,
  date: string,
  entries: Array<{ enrollmentId: number; status: AttendanceStatus }>,
  actor: Actor,
) {
  await assertValidDate(selector.semesterId, date);
  const roster = await gradeRepository.findClassRoster(selector.semesterId, selector.sectionId, selector.subjectId);
  const inClass = new Set(roster.map((enrollment) => enrollment.id));
  entries.forEach((entry, index) => {
    if (!inClass.has(entry.enrollmentId)) {
      throw AppError.validation({ [`entries.${index}.enrollmentId`]: "This student is not in this class." });
    }
  });

  const day = fromDateOnlyString(date);
  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      await tx.attendanceRecord.upsert({
        where: { enrollmentId_subjectId_date: { enrollmentId: entry.enrollmentId, subjectId: selector.subjectId, date: day } },
        create: { enrollmentId: entry.enrollmentId, subjectId: selector.subjectId, sectionId: selector.sectionId, date: day, status: entry.status, recordedById: actor.userId! },
        update: { status: entry.status, recordedById: actor.userId! },
      });
    }
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.ATTENDANCE_RECORDED,
        entityType: "attendance",
        entityId: `${selector.semesterId}:${selector.sectionId}:${selector.subjectId}:${date}`,
        description: `Recorded attendance for ${entries.length} student(s) on ${date}`,
      },
      tx,
    );
  });

  return getAttendanceSheet(selector, date);
}

/** Totals per student for the whole term, and the dates attendance was taken. */
export async function getAttendanceSummary(selector: ClassSelector) {
  const roster = await gradeRepository.findClassRoster(selector.semesterId, selector.sectionId, selector.subjectId);
  const records = await prisma.attendanceRecord.findMany({
    where: { subjectId: selector.subjectId, sectionId: selector.sectionId, enrollmentId: { in: roster.map((enrollment) => enrollment.id) } },
    select: { enrollmentId: true, status: true, date: true },
  });

  const dates = [...new Set(records.map((record) => toDateOnlyString(record.date)))].sort().reverse();
  const count = (enrollmentId: number, status: AttendanceStatus) =>
    records.filter((record) => record.enrollmentId === enrollmentId && record.status === status).length;

  return {
    dates,
    students: roster.map((enrollment) => ({
      enrollmentId: enrollment.id,
      student: studentOf(enrollment),
      present: count(enrollment.id, "PRESENT"),
      late: count(enrollment.id, "LATE"),
      absent: count(enrollment.id, "ABSENT"),
      excused: count(enrollment.id, "EXCUSED"),
    })),
  };
}
