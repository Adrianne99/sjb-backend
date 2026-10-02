import type { ScheduleWithRelations } from "../repositories/schedule.repository";

/** "204" for face-to-face classes, "Online" for online classes. */
export function whereLabel(schedule: { mode: string; room: { code: string } | null }) {
  return schedule.mode === "ONLINE" ? "Online" : (schedule.room?.code ?? "no room");
}

export function toScheduleDto(schedule: ScheduleWithRelations) {
  return {
    id: schedule.id,
    semesterId: schedule.semesterId,
    termLabel: `${schedule.semester.name}, ${schedule.semester.academicYear.name}`,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    subject: {
      id: schedule.subject.id,
      code: schedule.subject.code,
      name: schedule.subject.name,
      units: Number(schedule.subject.units),
    },
    section: {
      id: schedule.section.id,
      name: schedule.section.name,
      yearLevel: schedule.section.yearLevel,
      programCode: schedule.section.program.code,
    },
    instructor: {
      id: schedule.instructor.id,
      fullName: `${schedule.instructor.firstName} ${schedule.instructor.lastName}`,
    },
    mode: schedule.mode,
    /** null for online classes. */
    room: schedule.room ? { id: schedule.room.id, code: schedule.room.code, name: schedule.room.name } : null,
  };
}
