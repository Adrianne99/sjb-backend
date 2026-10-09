// A teacher's own classes (TEACHER role).
//
// Every function first finds the instructor linked to the logged-in account
// (instructors.user_id) — never an instructor ID sent by the browser — and
// refuses any class this instructor does not teach.
// Teachers save grades as DRAFTS only, then "Submit for review"; staff publish
// them or return them with a note. Teachers also take attendance.
import { prisma } from "../../config/database";
import type { AttendanceStatus } from "../../generated/prisma/client";
import { toScheduleDto } from "../../mappers/schedule.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import * as gradeRepository from "../../repositories/grade.repository";
import * as submissionRepository from "../../repositories/grade-submission.repository";
import * as scheduleRepository from "../../repositories/schedule.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { fullName } from "../../utils/person";
import type { ClassSelector, SaveClassGradesInput } from "../../validators/grade.validators";
import { listStudentAnnouncements } from "../announcements/announcement.service";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { getClassRoster, listClasses, saveClassGrades, toSubmissionDto } from "../grades/grade.service";
import * as attendance from "./attendance.service";

/** The instructor record of this account, or 403 if the account is not linked to one. */
async function findMyInstructor(userId: number) {
  const instructor = await prisma.instructor.findUnique({ where: { userId } });
  if (!instructor) {
    throw AppError.forbidden("This account is not linked to an instructor yet. Please ask the administrator to link it.");
  }
  return instructor;
}

/** 403 unless this instructor teaches at least one weekly slot of the class. */
async function assertTeachesClass(instructorId: number, selector: ClassSelector) {
  const slot = await prisma.classSchedule.findFirst({
    where: { semesterId: selector.semesterId, sectionId: selector.sectionId, subjectId: selector.subjectId, instructorId },
    select: { id: true },
  });
  if (!slot) throw AppError.forbidden("You can only open the classes you teach.");
}

async function termIdOrCurrent(semesterId?: number) {
  return semesterId ?? (await academicRepository.findCurrentSemester())?.id ?? null;
}

/** The teacher's weekly class schedule for a term (current term by default). */
export async function getMySchedule(userId: number, semesterId?: number) {
  const instructor = await findMyInstructor(userId);
  const termId = await termIdOrCurrent(semesterId);
  const slots = termId ? await scheduleRepository.listSchedules({ semesterId: termId, instructorId: instructor.id }) : [];
  return { instructor: { id: instructor.id, fullName: fullName(instructor) }, semesterId: termId, slots: slots.map(toScheduleDto) };
}

/** The teacher's classes in a term, with grade progress (same shape as /api/grades/classes). */
export async function listMyClasses(userId: number, semesterId?: number) {
  const instructor = await findMyInstructor(userId);
  return listClasses({ semesterId, instructorId: instructor.id });
}

/** Students of one of the teacher's classes, with their current grades. */
export async function getMyClassRoster(userId: number, selector: ClassSelector) {
  const instructor = await findMyInstructor(userId);
  await assertTeachesClass(instructor.id, selector);
  return getClassRoster(selector);
}

const LOCKED_MESSAGE =
  "You already submitted these grades for review. Ask the Registrar's Office to return them if you need to make changes.";

/** Saves DRAFT grades for one of the teacher's classes. Published grades are never changed here. */
export async function saveMyClassGrades(userId: number, input: SaveClassGradesInput, actor: Actor) {
  const instructor = await findMyInstructor(userId);
  await assertTeachesClass(instructor.id, input);
  const submission = await submissionRepository.findSubmission(input);
  if (submission?.status === "SUBMITTED") throw AppError.conflict(LOCKED_MESSAGE);
  return saveClassGrades(input, actor);
}

/**
 * "Submit for review": every student must have a grade, and there must be
 * drafts to review. The grade sheet is then locked until staff publish it or
 * return it with a note.
 */
export async function submitMyClassGrades(userId: number, selector: ClassSelector, actor: Actor) {
  const instructor = await findMyInstructor(userId);
  await assertTeachesClass(instructor.id, selector);

  const existing = await submissionRepository.findSubmission(selector);
  if (existing?.status === "SUBMITTED") throw AppError.conflict("These grades were already submitted for review.");

  const roster = await gradeRepository.findClassRoster(selector.semesterId, selector.sectionId, selector.subjectId);
  const missing = roster.filter((enrollment) => enrollment.grades.length === 0).length;
  if (missing > 0) {
    throw AppError.badRequest(`${missing} student(s) have no grade yet. Enter and save a grade for every student first.`);
  }
  if (!roster.some((enrollment) => enrollment.grades[0]?.status === "DRAFT")) {
    throw AppError.badRequest("There are no draft grades to submit — this class's grades are already published.");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const submission = await submissionRepository.saveSubmission(selector, { instructorId: instructor.id, submittedById: userId }, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.GRADES_SUBMITTED,
        entityType: "grade_sheet",
        entityId: `${selector.semesterId}:${selector.sectionId}:${selector.subjectId}`,
        description: `Submitted grades for ${submission.subject.code} — ${submission.section.name} for review`,
      },
      tx,
    );
    return submission;
  });
  return toSubmissionDto(saved);
}

// --- Attendance -------------------------------------------------------------------

export async function getMyAttendanceSheet(userId: number, selector: ClassSelector, date: string) {
  const instructor = await findMyInstructor(userId);
  await assertTeachesClass(instructor.id, selector);
  return attendance.getAttendanceSheet(selector, date);
}

export async function saveMyAttendance(
  userId: number,
  selector: ClassSelector,
  date: string,
  entries: Array<{ enrollmentId: number; status: AttendanceStatus }>,
  actor: Actor,
) {
  const instructor = await findMyInstructor(userId);
  await assertTeachesClass(instructor.id, selector);
  return attendance.saveAttendance(selector, date, entries, actor);
}

export async function getMyAttendanceSummary(userId: number, selector: ClassSelector) {
  const instructor = await findMyInstructor(userId);
  await assertTeachesClass(instructor.id, selector);
  return attendance.getAttendanceSummary(selector);
}

/** Announcements for the teacher's dashboard (the same ones students see). */
export async function listMyAnnouncements() {
  return listStudentAnnouncements(10);
}
