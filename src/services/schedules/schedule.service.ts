// Class schedules with conflict detection.
//
// A new or edited slot is rejected (409 SCHEDULE_CONFLICT) when, on the same
// day and term, its time overlaps another slot that has the same:
//   - instructor  (a teacher cannot be in two classes at once)
//   - room        (a room cannot host two classes at once; online classes have no room)
//   - section     (a section cannot attend two classes at once)
//
// Exception — COMBINED CLASSES: two sections taught together (same subject,
// instructor, mode, room and exact time) are allowed. Example: IT 2-A and
// IT 2-E both take IT104 on Monday 4:00–5:30 PM in room 204 with one teacher.
import { prisma, type DbClient } from "../../config/database";
import { Prisma } from "../../generated/prisma/client";
import { toScheduleDto, whereLabel } from "../../mappers/schedule.mapper";
import type { ScheduleWithRelations } from "../../repositories/schedule.repository";
import * as academicRepository from "../../repositories/academic.repository";
import * as scheduleRepository from "../../repositories/schedule.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import type { ListSchedulesQuery, ScheduleInput } from "../../validators/schedule.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";

export async function listSchedules(query: ListSchedulesQuery) {
  // Default to the current term so the list is never "everything ever".
  const semesterId = query.semesterId ?? (await academicRepository.findCurrentSemester())?.id;
  const rows = await scheduleRepository.listSchedules({ ...query, semesterId });
  return rows.map(toScheduleDto);
}

async function checkReferences(input: ScheduleInput, db: DbClient) {
  const [semester, section, subject, instructor, room] = await Promise.all([
    academicRepository.findSemesterById(input.semesterId, db),
    academicRepository.findSectionById(input.sectionId, db),
    academicRepository.findSubjectById(input.subjectId, db),
    academicRepository.findInstructorById(input.instructorId, db),
    input.roomId ? academicRepository.findRoomById(input.roomId, db) : Promise.resolve(null),
  ]);

  const errors: Record<string, string> = {};
  if (!semester) errors.semesterId = "Term not found.";
  if (!section) errors.sectionId = "Section not found.";
  else if (semester && section.academicYearId !== semester.academicYearId) {
    errors.sectionId = "This section belongs to a different academic year.";
  }
  if (!subject || !subject.isActive) errors.subjectId = "Subject not found or inactive.";
  if (!instructor || !instructor.isActive) errors.instructorId = "Instructor not found or inactive.";
  if (input.roomId && (!room || !room.isActive)) errors.roomId = "Room not found or inactive.";
  if (Object.keys(errors).length) throw AppError.validation(errors);
}

/** True when `other` is the same class taught together with another section. */
export function isCombinedClass(input: ScheduleInput, other: ScheduleWithRelations) {
  return (
    other.sectionId !== input.sectionId &&
    other.subjectId === input.subjectId &&
    other.instructorId === input.instructorId &&
    other.mode === input.mode &&
    other.roomId === input.roomId &&
    other.dayOfWeek === input.dayOfWeek &&
    other.startTime === input.startTime &&
    other.endTime === input.endTime
  );
}

async function assertNoConflicts(input: ScheduleInput, db: DbClient, excludeId?: number) {
  const overlapping = await scheduleRepository.findConflictingSchedules({ ...input, excludeId }, db);
  const conflicts = overlapping.filter((other) => !isCombinedClass(input, other));
  if (conflicts.length === 0) return;

  const details = conflicts.map((conflict) => {
    const reasons: string[] = [];
    if (conflict.instructorId === input.instructorId) reasons.push("instructor");
    if (input.roomId && conflict.roomId === input.roomId) reasons.push("room");
    if (conflict.sectionId === input.sectionId) reasons.push("section");
    return {
      reasons,
      schedule: toScheduleDto(conflict),
      message: `${conflict.subject.code} (${conflict.section.name}) ${conflict.startTime}–${conflict.endTime} in ${whereLabel(conflict)} with ${conflict.instructor.firstName} ${conflict.instructor.lastName} — same ${reasons.join(", ")}`,
    };
  });

  throw new AppError(409, "SCHEDULE_CONFLICT", "This schedule conflicts with existing classes.", { details });
}

/**
 * Runs the check + write in a SERIALIZABLE transaction so two people saving
 * overlapping schedules at the same moment cannot both succeed.
 */
function inSerializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createSchedule(input: ScheduleInput, actor: Actor) {
  const schedule = await inSerializableTransaction(async (tx) => {
    await checkReferences(input, tx);
    await assertNoConflicts(input, tx);
    const created = await scheduleRepository.createSchedule(input, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.SCHEDULE_CREATED,
        entityType: "class_schedule",
        entityId: created.id,
        description: `Scheduled ${created.subject.code} for ${created.section.name}, ${created.dayOfWeek} ${created.startTime}–${created.endTime} (${whereLabel(created)})`,
      },
      tx,
    );
    return created;
  });
  return toScheduleDto(schedule);
}

export async function updateSchedule(id: number, input: ScheduleInput, actor: Actor) {
  const schedule = await inSerializableTransaction(async (tx) => {
    const existing = await scheduleRepository.findScheduleById(id, tx);
    if (!existing) throw AppError.notFound("Schedule not found.");
    await checkReferences(input, tx);
    await assertNoConflicts(input, tx, id);
    const updated = await scheduleRepository.updateSchedule(id, input, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.SCHEDULE_UPDATED,
        entityType: "class_schedule",
        entityId: id,
        description: `Updated schedule of ${updated.subject.code} for ${updated.section.name} to ${updated.dayOfWeek} ${updated.startTime}–${updated.endTime} (${whereLabel(updated)})`,
      },
      tx,
    );
    return updated;
  });
  return toScheduleDto(schedule);
}

export async function deleteSchedule(id: number, actor: Actor) {
  const existing = await scheduleRepository.findScheduleById(id);
  if (!existing) throw AppError.notFound("Schedule not found.");
  await scheduleRepository.deleteSchedule(id);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.SCHEDULE_DELETED,
    entityType: "class_schedule",
    entityId: id,
    description: `Removed ${existing.subject.code} (${existing.section.name}) ${existing.dayOfWeek} ${existing.startTime}–${existing.endTime}`,
  });
}
