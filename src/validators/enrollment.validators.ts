import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { dateOnly, moneyAmount, optionalId, optionalText, requiredText, searchQuery } from "./common.validators";

export const ENROLLMENT_STATUSES = ["PENDING", "ENROLLED", "DROPPED", "WITHDRAWN", "COMPLETED"] as const;

export const assessmentItemSchema = z.object({
  description: requiredText("Description", 150),
  amount: moneyAmount("Amount"),
});

export const createEnrollmentSchema = z.object({
  studentId: z.coerce.number({ error: "Select a student." }).int().positive("Select a student."),
  semesterId: z.coerce.number({ error: "Select a term." }).int().positive("Select a term."),
  programId: z.coerce.number({ error: "Select a program." }).int().positive("Select a program."),
  yearLevel: z.coerce.number().int().min(1, "Select a year level.").max(12),
  sectionId: optionalId.nullable(),
  enrollmentDate: dateOnly("Enrollment date"),
  status: z.enum(ENROLLMENT_STATUSES).default("PENDING"),
  remarks: optionalText(255),
  assessments: z.array(assessmentItemSchema).max(20).default([]),
});

export const updateEnrollmentSchema = z.object({
  yearLevel: z.coerce.number().int().min(1).max(12),
  sectionId: optionalId.nullable(),
  enrollmentDate: dateOnly("Enrollment date"),
  status: z.enum(ENROLLMENT_STATUSES),
  remarks: optionalText(255),
});

export const listEnrollmentsQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  semesterId: optionalId,
  academicYearId: optionalId,
  programId: optionalId,
  yearLevel: z.coerce.number().int().min(1).max(12).optional(),
  sectionId: optionalId,
  status: z.enum(ENROLLMENT_STATUSES).optional(),
  studentId: optionalId,
});

/** Irregular students: join another section's class for one subject. */
export const extraSubjectSchema = z.object({
  sectionId: z.coerce.number({ error: "Select a section." }).int().positive("Select a section."),
  subjectId: z.coerce.number({ error: "Select a subject." }).int().positive("Select a subject."),
  /** Add the cross-enrollment fee (₱2,500 per subject, cash basis) as a charge. */
  chargeCrossEnrollmentFee: z.boolean().default(false),
});

export type ExtraSubjectInput = z.infer<typeof extraSubjectSchema>;
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
/** New number of units for the tuition line. */
export const tuitionUnitsSchema = z.object({
  units: z.coerce.number({ error: "Enter the number of units." }).int("Units must be a whole number.").min(1, "Enter at least 1 unit.").max(60, "That is too many units."),
});

export type AssessmentItemInput = z.infer<typeof assessmentItemSchema>;
export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;
