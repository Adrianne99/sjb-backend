import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { dateOnly, optionalId, optionalText, requiredText, searchQuery } from "./common.validators";

export const REQUIREMENT_STATUSES = ["PENDING", "SUBMITTED", "VERIFIED"] as const;

/** A document in the requirements list (e.g. "Form 137"). */
export const requirementTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,30}$/, "Use 2–30 capital letters, numbers or underscores, e.g. FORM_137."),
  name: requiredText("Name", 150),
  description: optionalText(500),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

/** Update one student's status for one document. */
export const studentRequirementSchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES, { error: "Select a status." }),
  submittedDate: dateOnly("Date submitted").nullish(),
  remarks: optionalText(255),
});

/** Requirements page: who is missing what. */
export const complianceQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  programId: optionalId,
  /** complete = every active requirement VERIFIED; incomplete = anything else. */
  completion: z.enum(["complete", "incomplete"]).optional(),
  requirementTypeId: optionalId,
  status: z.enum(REQUIREMENT_STATUSES).optional(),
});

export type RequirementTypeInput = z.infer<typeof requirementTypeSchema>;
export type StudentRequirementInput = z.infer<typeof studentRequirementSchema>;
export type ComplianceQuery = z.infer<typeof complianceQuerySchema>;
