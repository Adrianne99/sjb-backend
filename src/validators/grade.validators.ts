import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { optionalId, optionalText, searchQuery } from "./common.validators";

const remarkSchema = z.enum(["PASSED", "FAILED", "INCOMPLETE", "DROPPED"]).nullish();
const gradeValue = z.coerce.number().nullish();

export const createGradeSchema = z.object({
  enrollmentId: z.coerce.number({ error: "Select a student." }).int().positive("Select a student."),
  subjectId: z.coerce.number({ error: "Select a subject." }).int().positive("Select a subject."),
  grade: gradeValue,
  remark: remarkSchema,
});

export const updateGradeSchema = z.object({
  grade: gradeValue,
  remark: remarkSchema,
  /** Required by the service when changing a PUBLISHED grade. */
  reason: optionalText(255),
});

/** Save a whole class at once from the grade encoding screen. */
export const saveClassGradesSchema = z.object({
  semesterId: z.coerce.number().int().positive(),
  sectionId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  entries: z
    .array(
      z.object({
        enrollmentId: z.coerce.number().int().positive(),
        grade: gradeValue,
        remark: remarkSchema,
      }),
    )
    .min(1, "Enter at least one grade.")
    .max(200),
});

export const classSelectorSchema = z.object({
  semesterId: z.coerce.number({ error: "Select a term." }).int().positive("Select a term."),
  sectionId: z.coerce.number({ error: "Select a section." }).int().positive("Select a section."),
  subjectId: z.coerce.number({ error: "Select a subject." }).int().positive("Select a subject."),
});

export const listClassesQuerySchema = z.object({
  semesterId: optionalId,
  sectionId: optionalId,
});

export const listGradesQuerySchema = paginationQuerySchema.extend({
  semesterId: optionalId,
  academicYearId: optionalId,
  subjectId: optionalId,
  sectionId: optionalId,
  studentId: optionalId,
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  search: searchQuery,
});

export type CreateGradeInput = z.infer<typeof createGradeSchema>;
export type UpdateGradeInput = z.infer<typeof updateGradeSchema>;
export type SaveClassGradesInput = z.infer<typeof saveClassGradesSchema>;
export type ClassSelector = z.infer<typeof classSelectorSchema>;
export type ListGradesQuery = z.infer<typeof listGradesQuerySchema>;
