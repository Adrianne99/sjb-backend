import { z } from "zod";
import { dateOnly, optionalEmail, optionalId, optionalText, requiredText } from "./common.validators";

export const programSchema = z.object({
  code: requiredText("Program code", 20).transform((value) => value.toUpperCase()),
  name: requiredText("Program name", 150),
  level: requiredText("Level", 60),
  description: optionalText(2000),
  durationYears: z.coerce.number().int().min(1).max(8).default(4),
  isActive: z.boolean().default(true),
});

export const academicYearSchema = z
  .object({
    name: z.string().trim().regex(/^\d{4}-\d{4}$/, "Use the format 2026-2027."),
    startDate: dateOnly("Start date"),
    endDate: dateOnly("End date"),
  })
  .refine((data) => data.endDate > data.startDate, { message: "End date must be after the start date.", path: ["endDate"] });

export const semesterSchema = z.object({
  academicYearId: z.coerce.number().int().positive("Academic year is required."),
  name: requiredText("Term name", 50),
  termNumber: z.coerce.number().int().min(1).max(4),
  startDate: dateOnly("Start date").nullish(),
  endDate: dateOnly("End date").nullish(),
});

export const sectionSchema = z.object({
  name: requiredText("Section name", 50),
  programId: z.coerce.number().int().positive("Program is required."),
  yearLevel: z.coerce.number().int().min(1).max(12),
  academicYearId: z.coerce.number().int().positive("Academic year is required."),
});

export const sectionFiltersSchema = z.object({
  academicYearId: optionalId,
  programId: optionalId,
  yearLevel: z.coerce.number().int().min(1).max(12).optional(),
});

export const subjectSchema = z.object({
  code: requiredText("Subject code", 20).transform((value) => value.toUpperCase()),
  name: requiredText("Subject name", 150),
  units: z.coerce.number().min(0, "Units cannot be negative.").max(30),
  description: optionalText(2000),
  isActive: z.boolean().default(true),
});

export const instructorSchema = z.object({
  employeeNumber: requiredText("Employee number", 20),
  firstName: requiredText("First name", 100),
  lastName: requiredText("Last name", 100),
  email: optionalEmail,
  isActive: z.boolean().default(true),
});

export const roomSchema = z.object({
  code: requiredText("Room code", 20).transform((value) => value.toUpperCase()),
  name: optionalText(100),
  capacity: z.coerce.number().int().min(1).max(1000).nullish(),
  isActive: z.boolean().default(true),
});

export type ProgramInput = z.infer<typeof programSchema>;
export type AcademicYearInput = z.infer<typeof academicYearSchema>;
export type SemesterInput = z.infer<typeof semesterSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type InstructorInput = z.infer<typeof instructorSchema>;
export type RoomInput = z.infer<typeof roomSchema>;
