// Database access for class schedules.
import { prisma, type DbClient } from "../config/database";
import type { DayOfWeek, Prisma } from "../generated/prisma/client";

export const scheduleInclude = {
  subject: true,
  section: { include: { program: true } },
  instructor: true,
  room: true,
  semester: { include: { academicYear: true } },
} satisfies Prisma.ClassScheduleInclude;

export type ScheduleWithRelations = Prisma.ClassScheduleGetPayload<{ include: typeof scheduleInclude }>;

const DAY_ORDER: DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/** MySQL sorts enums by their declared order, but we sort in JS to be explicit. */
export function sortByDayAndTime<T extends { dayOfWeek: DayOfWeek; startTime: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime),
  );
}

export interface ScheduleFilters {
  semesterId?: number;
  sectionId?: number;
  instructorId?: number;
  roomId?: number;
  subjectId?: number;
  dayOfWeek?: DayOfWeek;
}

export async function listSchedules(filters: ScheduleFilters) {
  const rows = await prisma.classSchedule.findMany({ where: filters, include: scheduleInclude });
  return sortByDayAndTime(rows);
}

export function findScheduleById(id: number, db: DbClient = prisma) {
  return db.classSchedule.findUnique({ where: { id }, include: scheduleInclude });
}

/**
 * Finds schedules that overlap the given time slot and share the instructor,
 * room OR section (online classes have no room, so only instructor/section count).
 * Two slots overlap when: existing.start < new.end AND existing.end > new.start.
 * ("HH:MM" strings compare correctly as text.)
 */
export function findConflictingSchedules(
  slot: {
    semesterId: number;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    instructorId: number;
    roomId: number | null;
    sectionId: number;
    excludeId?: number;
  },
  db: DbClient = prisma,
) {
  return db.classSchedule.findMany({
    where: {
      semesterId: slot.semesterId,
      dayOfWeek: slot.dayOfWeek,
      startTime: { lt: slot.endTime },
      endTime: { gt: slot.startTime },
      OR: [{ instructorId: slot.instructorId }, ...(slot.roomId ? [{ roomId: slot.roomId }] : []), { sectionId: slot.sectionId }],
      ...(slot.excludeId ? { NOT: { id: slot.excludeId } } : {}),
    },
    include: scheduleInclude,
  });
}

export function createSchedule(data: Prisma.ClassScheduleUncheckedCreateInput, db: DbClient = prisma) {
  return db.classSchedule.create({ data, include: scheduleInclude });
}

export function updateSchedule(id: number, data: Prisma.ClassScheduleUncheckedUpdateInput, db: DbClient = prisma) {
  return db.classSchedule.update({ where: { id }, data, include: scheduleInclude });
}

export function deleteSchedule(id: number) {
  return prisma.classSchedule.delete({ where: { id } });
}

/** The first meeting of a subject for a section in a term (used to find the instructor). */
export function findOffering(semesterId: number, sectionId: number, subjectId: number, db: DbClient = prisma) {
  return db.classSchedule.findFirst({
    where: { semesterId, sectionId, subjectId },
    include: scheduleInclude,
    orderBy: { id: "asc" },
  });
}

/** Distinct subject + section combinations offered in a term (the "classes"). */
export function listOfferings(semesterId: number, sectionId?: number) {
  return prisma.classSchedule.findMany({
    where: { semesterId, ...(sectionId ? { sectionId } : {}) },
    distinct: ["subjectId", "sectionId"],
    include: scheduleInclude,
    orderBy: [{ sectionId: "asc" }, { subjectId: "asc" }],
  });
}

/**
 * Every weekly class slot of ONE student in a term:
 * the classes of their own section + any extra subjects taken with other
 * sections (irregular students).
 */
export async function findSlotsForStudent(
  semesterId: number,
  homeSectionId: number | null,
  extraSubjects: Array<{ sectionId: number; subjectId: number }>,
  db: DbClient = prisma,
) {
  const classes: Prisma.ClassScheduleWhereInput[] = [
    ...(homeSectionId ? [{ sectionId: homeSectionId }] : []),
    ...extraSubjects.map((extra) => ({ sectionId: extra.sectionId, subjectId: extra.subjectId })),
  ];
  if (classes.length === 0) return [];
  const rows = await db.classSchedule.findMany({ where: { semesterId, OR: classes }, include: scheduleInclude });
  return sortByDayAndTime(rows);
}

/** True when two slots meet on the same day at overlapping times. */
export function slotsOverlap(a: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }, b: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }) {
  return a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && a.endTime > b.startTime;
}
