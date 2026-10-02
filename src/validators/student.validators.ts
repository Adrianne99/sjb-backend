import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import {
  dateOnly,
  optionalEmail,
  optionalId,
  optionalText,
  phoneNumber,
  requiredText,
  searchQuery,
} from "./common.validators";

export const sexSchema = z.enum(["MALE", "FEMALE"], { error: "Select the student's sex." });

export const birthdateSchema = dateOnly("Date of birth").refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age >= 3 && age <= 100;
}, "Enter a realistic date of birth.");

export const studentProfileSchema = z.object({
  email: optionalEmail,
  contactNumber: phoneNumber,
  addressLine: optionalText(255),
  barangay: optionalText(100),
  city: optionalText(100),
  province: optionalText(100),
  zipCode: z
    .string()
    .trim()
    .regex(/^\d{0,10}$/, "ZIP code must contain digits only.")
    .nullish()
    .transform((value) => (value ? value : null)),
  guardianName: optionalText(150),
  guardianRelationship: optionalText(50),
  guardianContactNumber: phoneNumber,
});

const studentCoreFields = {
  firstName: requiredText("First name", 100),
  middleName: optionalText(100),
  lastName: requiredText("Last name", 100),
  suffix: optionalText(20),
  dateOfBirth: birthdateSchema,
  sex: sexSchema,
  programId: z.coerce.number({ error: "Program is required." }).int().positive("Program is required."),
  profile: studentProfileSchema.default({
    email: null,
    contactNumber: null,
    addressLine: null,
    barangay: null,
    city: null,
    province: null,
    zipCode: null,
    guardianName: null,
    guardianRelationship: null,
    guardianContactNumber: null,
  }),
};

export const createStudentSchema = z.object({
  /** Leave empty to auto-generate (e.g. 2026-0042). */
  studentNumber: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4,6}$/, "Student ID must look like 2026-0001.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  ...studentCoreFields,
  /** Optionally enroll the student in a term right away (same transaction). */
  initialEnrollment: z
    .object({
      semesterId: z.coerce.number().int().positive("Select a term."),
      yearLevel: z.coerce.number().int().min(1).max(12),
      sectionId: optionalId.nullable(),
      status: z.enum(["PENDING", "ENROLLED"]).default("PENDING"),
    })
    .nullish(),
  createAccount: z.boolean().default(false),
});

export const updateStudentSchema = z.object({
  ...studentCoreFields,
  status: z.enum(["ACTIVE", "GRADUATED"]).optional(),
});

export const listStudentsQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  programId: optionalId,
  yearLevel: z.coerce.number().int().min(1).max(12).optional(),
  sectionId: optionalId,
  enrollmentStatus: z.enum(["PENDING", "ENROLLED", "DROPPED", "WITHDRAWN", "COMPLETED"]).optional(),
  status: z.enum(["ACTIVE", "GRADUATED", "ARCHIVED"]).optional(),
});

export const createAccountSchema = z.object({
  email: optionalEmail,
  sendEmail: z.boolean().default(false),
});

export const accountStatusSchema = z.object({ isActive: z.boolean() });

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type StudentProfileInput = z.infer<typeof studentProfileSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
