// Reusable Zod building blocks shared by several validators.
import { z } from "zod";

/** Optional text: trims, and turns "" into null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));

export const requiredText = (label: string, max: number) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);

/** "YYYY-MM-DD" that is a real calendar date. */
export const dateOnly = (label = "Date") =>
  z
    .string({ error: `${label} is required.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be in YYYY-MM-DD format.`)
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), `${label} is not a valid date.`);

/** "HH:MM" in 24-hour time. */
export const timeOfDay = (label = "Time") =>
  z.string({ error: `${label} is required.` }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be in HH:MM (24-hour) format.`);

export const positiveId = (label = "ID") =>
  z.coerce.number({ error: `${label} is required.` }).int().positive(`${label} is required.`);

export const optionalId = z.coerce.number().int().positive().optional();

/** Philippine-friendly phone check: digits, spaces, +, -, parentheses. */
export const phoneNumber = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+()\-\s]*$/, "Use digits, spaces, +, - or parentheses only.")
  .nullish()
  .transform((value) => (value ? value : null));

export const optionalEmail = z
  .union([z.literal(""), z.email("Enter a valid email address.").max(191)])
  .nullish()
  .transform((value) => (value ? value.toLowerCase() : null));

/** "true"/"false" from a query string. */
export const queryBoolean = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

/** Search box text from a query string. */
export const searchQuery = z.string().trim().max(100).optional().transform((value) => value || undefined);

/** Peso amount: positive, at most 2 decimal places. */
export const moneyAmount = (label = "Amount") =>
  z.coerce
    .number({ error: `${label} is required.` })
    .positive(`${label} must be greater than zero.`)
    .max(10_000_000, `${label} is too large.`)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, `${label} can have at most 2 decimal places.`);
