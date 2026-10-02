import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { dateOnly, moneyAmount, optionalId, optionalText, requiredText, searchQuery } from "./common.validators";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "GCASH", "MAYA", "CHECK", "OTHER"] as const;

const referenceNumber = z
  .string()
  .trim()
  .max(50)
  .regex(/^[A-Za-z0-9\-/]*$/, "Use letters, numbers, - or / only.");

export const recordPaymentSchema = z.object({
  enrollmentId: z.coerce.number({ error: "Select the student's term." }).int().positive("Select the student's term."),
  amount: moneyAmount("Amount"),
  paymentDate: dateOnly("Payment date"),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Select a payment method." }),
  /** Official receipt (OR) number. Leave empty to auto-generate. */
  referenceNumber: referenceNumber.optional().transform((value) => value || undefined),
  remarks: optionalText(255),
});

/** Admin correction of non-amount details. Amounts are immutable — void and re-record instead. */
export const updatePaymentSchema = z.object({
  paymentDate: dateOnly("Payment date"),
  paymentMethod: z.enum(PAYMENT_METHODS),
  referenceNumber: referenceNumber.min(1, "Reference number is required."),
  remarks: optionalText(255),
});

export const voidPaymentSchema = z.object({
  reason: requiredText("Reason", 255),
});

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  studentId: optionalId,
  semesterId: optionalId,
  academicYearId: optionalId,
  status: z.enum(["RECORDED", "VOIDED"]).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  dateFrom: dateOnly("From date").optional(),
  dateTo: dateOnly("To date").optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
