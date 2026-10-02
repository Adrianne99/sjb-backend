import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { optionalText, queryBoolean, requiredText, searchQuery } from "./common.validators";

const staffRole = z.enum(["ADMIN", "STAFF"], { error: "Select a role." });

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
});

export const updateUserSchema = z.object({
  email: z.email("Enter a valid email address.").max(191).transform((value) => value.toLowerCase()).nullish(),
  firstName: requiredText("First name", 100).optional(),
  lastName: requiredText("Last name", 100).optional(),
  position: optionalText(100),
  role: staffRole.optional(),
  isActive: z.boolean().optional(),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  role: z.enum(["ADMIN", "STAFF", "STUDENT"]).optional(),
  isActive: queryBoolean,
});

export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
