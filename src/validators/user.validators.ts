import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { optionalId, optionalText, queryBoolean, requiredText, searchQuery } from "./common.validators";

/** Roles an office account can have (student accounts are created from student records). */
const staffRole = z.enum(["ADMIN", "STAFF", "REGISTRAR", "CASHIER", "TEACHER"], { error: "Select a role." });

/** A TEACHER account must be linked to an instructor (Settings → Instructors). */
const teacherNeedsInstructor = (data: { role?: string; instructorId?: number }, ctx: z.RefinementCtx) => {
  if (data.role === "TEACHER" && !data.instructorId) {
    ctx.addIssue({ code: "custom", path: ["instructorId"], message: "Select the instructor this teacher account belongs to." });
  }
};

export const createStaffUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(50)
    .regex(/^[a-z0-9._-]+$/, "Use lowercase letters, numbers, dots, dashes or underscores."),
  email: z.email("Enter a valid email address.").max(191).transform((value) => value.toLowerCase()),
  firstName: requiredText("First name", 100),
  lastName: requiredText("Last name", 100),
  position: optionalText(100),
  role: staffRole,
  /** Required when role is TEACHER. */
  instructorId: optionalId,
}).superRefine(teacherNeedsInstructor);

export const updateUserSchema = z.object({
  email: z.email("Enter a valid email address.").max(191).transform((value) => value.toLowerCase()).nullish(),
  firstName: requiredText("First name", 100).optional(),
  lastName: requiredText("Last name", 100).optional(),
  position: optionalText(100),
  role: staffRole.optional(),
  /** Required when changing the role to TEACHER (checked in user.service.ts). */
  instructorId: optionalId,
  isActive: z.boolean().optional(),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  role: z.enum(["ADMIN", "STAFF", "REGISTRAR", "CASHIER", "TEACHER", "STUDENT"]).optional(),
  isActive: queryBoolean,
});

export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
