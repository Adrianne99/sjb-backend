import { z } from "zod";
import { optionalId, timeOfDay } from "./common.validators";

export const DAYS_OF_WEEK = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export const CLASS_MODES = ["FACE_TO_FACE", "ONLINE"] as const;

export const scheduleSchema = z
  .object({
    semesterId: z.coerce.number({ error: "Select a term." }).int().positive("Select a term."),
    subjectId: z.coerce.number({ error: "Select a subject." }).int().positive("Select a subject."),
    sectionId: z.coerce.number({ error: "Select a section." }).int().positive("Select a section."),
    instructorId: z.coerce.number({ error: "Select an instructor." }).int().positive("Select an instructor."),
    mode: z.enum(CLASS_MODES, { error: "Select face to face or online." }).default("FACE_TO_FACE"),
    /** Required for face-to-face classes; ignored (saved as empty) for online classes. */
    roomId: z.coerce.number().int().positive().nullish(),
    dayOfWeek: z.enum(DAYS_OF_WEEK, { error: "Select a day." }),
    startTime: timeOfDay("Start time"),
    endTime: timeOfDay("End time"),
  })
  .refine((data) => data.endTime > data.startTime, { message: "End time must be after the start time.", path: ["endTime"] })
  .refine((data) => data.mode === "ONLINE" || Boolean(data.roomId), { message: "Select a room for a face-to-face class.", path: ["roomId"] })
  .transform((data) => ({ ...data, roomId: data.mode === "ONLINE" ? null : (data.roomId ?? null) }));

export const listSchedulesQuerySchema = z.object({
  semesterId: optionalId,
  sectionId: optionalId,
  instructorId: optionalId,
  roomId: optionalId,
  subjectId: optionalId,
  dayOfWeek: z.enum(DAYS_OF_WEEK).optional(),
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;
