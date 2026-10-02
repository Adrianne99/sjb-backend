// Online pre-registration ("Enroll Now") — public form + staff review.
import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { optionalId, optionalText, phoneNumber, requiredText, searchQuery } from "./common.validators";
import { birthdateSchema, sexSchema } from "./student.validators";

export const APPLICATION_STATUSES = ["SUBMITTED", "CONVERTED", "REJECTED"] as const;
export const APPLICANT_TYPES = ["NEW", "TRANSFEREE", "RETURNING"] as const;

/** What the public form sends. */
export const applicationSchema = z.object({
  firstName: requiredText("First name", 100),
  middleName: optionalText(100),
  lastName: requiredText("Last name", 100),
  suffix: optionalText(20),
  dateOfBirth: birthdateSchema,
  sex: sexSchema,
  // Required: the confirmation and the "You're enrolled" email go here.
  email: z.email("Enter a valid email address.").max(191).transform((value) => value.toLowerCase()),
  contactNumber: z
    .string({ error: "Contact number is required." })
    .trim()
    .min(7, "Enter a valid contact number.")
    .max(30)
    .regex(/^[0-9+()\-\s]+$/, "Use digits, spaces, +, - or parentheses only."),
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
  programId: z.coerce.number({ error: "Select a program." }).int().positive("Select a program."),
  yearLevel: z.coerce.number({ error: "Select a year level." }).int().min(1).max(12),
  applicantType: z.enum(APPLICANT_TYPES, { error: "Select new, transferee or returning." }),
  previousSchool: optionalText(200),
  privacyConsent: z.literal(true, { error: "Please agree to the data privacy notice to continue." }),
  /** Hidden "honeypot" field: people never see it, spam bots fill it in. Must stay empty. */
  website: z.string().max(0).optional().or(z.literal("")),
});

export const listApplicationsQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  status: z.enum(APPLICATION_STATUSES).optional(),
  programId: optionalId,
});

/** Turn an application into a student record + PENDING enrollment. */
export const convertApplicationSchema = z.object({
  semesterId: z.coerce.number({ error: "Select a term." }).int().positive("Select a term."),
  yearLevel: z.coerce.number().int().min(1).max(12).optional(),
  sectionId: optionalId.nullable(),
});

export const rejectApplicationSchema = z.object({
  remarks: requiredText("Reason", 500),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
export type ConvertApplicationInput = z.infer<typeof convertApplicationSchema>;
