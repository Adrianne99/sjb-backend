import { z } from "zod";

const peso = (label: string) => z.coerce.number({ error: `${label} is required.` }).min(0, `${label} cannot be negative.`).max(10_000_000);

/** One row of the tuition fee options (program + year level). */
export const feeScheduleSchema = z.object({
  programId: z.coerce.number({ error: "Select a program." }).int().positive("Select a program."),
  yearLevel: z.coerce.number().int().min(1).max(12),
  units: z.coerce.number().int().min(0).max(60).default(0),
  ratePerUnit: peso("Rate per unit").default(0),
  miscFee: peso("Miscellaneous fee").default(0),
  downPayment: peso("Down payment").default(0),
  prelimPayment: peso("Prelim payment").default(0),
  midtermPayment: peso("Midterm payment").default(0),
  earlyBirdDiscount: peso("Early-bird discount").default(0),
  cashDiscount: peso("Cash discount").default(0),
  /** Senior High only: tuition for the whole school year. Leave empty for college. */
  annualTuition: peso("Whole-year tuition").nullish().transform((value) => value ?? null),
  isActive: z.boolean().default(true),
});

export const PAYMENT_PLANS = ["INSTALLMENT", "EARLY_BIRD", "CASH", "SHS_NO_VOUCHER", "SHS_VOUCHER"] as const;

/** Apply the tuition fees to an enrollment (or just preview them). */
export const applyFeesSchema = z.object({
  plan: z.enum(PAYMENT_PLANS, { error: "Select a payment option." }),
  /** Units actually taken this term (defaults to the fee schedule's units). */
  units: z.coerce.number().int().min(0).max(60).nullish(),
  preview: z.boolean().default(false),
});

export const crossEnrollmentFeeSchema = z.object({ amount: peso("Cross-enrollment fee") });

export type FeeScheduleInput = z.infer<typeof feeScheduleSchema>;
export type ApplyFeesInput = z.infer<typeof applyFeesSchema>;
