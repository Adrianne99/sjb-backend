// =============================================================================
// Tuition fee rules — the school's "Tuition Fee Options" in code.
//
// College (per term):
//   Total = units x rate per unit (320) + miscellaneous fee (2,500)
//   INSTALLMENT : Down payment, Prelim, Midterm, Final (= whatever remains)
//   EARLY_BIRD  : Total - early-bird discount (1,000), paid 1 month before the term
//   CASH        : Total - cash discount (500), paid up to the first day of classes
// Senior High (per school year):
//   SHS_NO_VOUCHER : whole-year tuition (25,000)
//   SHS_VOUCHER    : free tuition
//
// These are PURE functions (no database), so they are easy to test and reuse.
// =============================================================================
import { Prisma } from "../../generated/prisma/client";
import type { PaymentPlan } from "../../generated/prisma/client";

/** The numbers from a fee schedule, saved on the enrollment as a snapshot. */
export interface FeeBreakdown {
  units: number;
  ratePerUnit: number;
  miscFee: number;
  downPayment: number;
  prelimPayment: number;
  midtermPayment: number;
  earlyBirdDiscount: number;
  cashDiscount: number;
  /** Set for Senior High (whole-year tuition); null for per-term programs. */
  annualTuition: number | null;
}

export interface FeeLine {
  description: string;
  amount: Prisma.Decimal;
}

export const PLAN_LABELS: Record<PaymentPlan, string> = {
  INSTALLMENT: "Installment",
  EARLY_BIRD: "Early bird payment",
  CASH: "Cash payment",
  SHS_NO_VOUCHER: "Senior High — without voucher",
  SHS_VOUCHER: "Senior High — with voucher",
};

const peso = (value: number) => `₱${value.toLocaleString("en-PH")}`;

/** "Tuition Fee (23 units × ₱320)" — the description of the per-unit tuition line. */
export function tuitionLineDescription(units: number, ratePerUnit: number) {
  return `Tuition Fee (${units} units × ${peso(ratePerUnit)})`;
}

/** Reads units and rate back from a tuition line's description (null if it is another kind of charge). */
export function parseTuitionLine(description: string): { units: number; ratePerUnit: number } | null {
  const match = /^Tuition Fee \((\d+(?:\.\d+)?) units × ₱([\d,]+(?:\.\d+)?)\)$/.exec(description.trim());
  if (!match) return null;
  return { units: Number(match[1]), ratePerUnit: Number(match[2].replace(/,/g, "")) };
}

export function isAnnualSchedule(breakdown: Pick<FeeBreakdown, "annualTuition">): boolean {
  return breakdown.annualTuition !== null;
}

/** Which payment plans a fee schedule offers. */
export function plansFor(breakdown: Pick<FeeBreakdown, "annualTuition">): PaymentPlan[] {
  return isAnnualSchedule(breakdown) ? ["SHS_NO_VOUCHER", "SHS_VOUCHER"] : ["INSTALLMENT", "EARLY_BIRD", "CASH"];
}

/** Total for one term before discounts (college). */
export function termTotal(breakdown: FeeBreakdown): number {
  return breakdown.units * breakdown.ratePerUnit + breakdown.miscFee;
}

/**
 * The charge lines to create for a plan. Discounts are negative lines.
 * `annualAlreadyCharged` = Senior High whole-year tuition was already charged
 * in another term of the same school year.
 */
export function buildFeeLines(breakdown: FeeBreakdown, plan: PaymentPlan, options: { annualAlreadyCharged?: boolean } = {}): FeeLine[] {
  const line = (description: string, amount: number): FeeLine => ({ description, amount: new Prisma.Decimal(amount) });

  if (isAnnualSchedule(breakdown)) {
    if (plan === "SHS_VOUCHER" || options.annualAlreadyCharged) return [];
    return [line("Tuition Fee (whole school year)", breakdown.annualTuition!)];
  }

  const lines = [
    line(tuitionLineDescription(breakdown.units, breakdown.ratePerUnit), breakdown.units * breakdown.ratePerUnit),
    line("Miscellaneous Fee", breakdown.miscFee),
  ];
  if (plan === "EARLY_BIRD" && breakdown.earlyBirdDiscount > 0) lines.push(line("Early bird discount", -breakdown.earlyBirdDiscount));
  if (plan === "CASH" && breakdown.cashDiscount > 0) lines.push(line("Cash payment discount", -breakdown.cashDiscount));
  return lines;
}

export interface Installment {
  label: string;
  amount: string;
  paid: string;
  remaining: string;
  status: "PAID" | "PARTIAL" | "DUE";
}

/** Total of the plan's own charge lines (tuition + misc − discount), before any extra charges. */
function planTotal(plan: PaymentPlan, breakdown: FeeBreakdown | null): Prisma.Decimal | null {
  if (!breakdown || isAnnualSchedule(breakdown)) return null;
  return buildFeeLines(breakdown, plan).reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0));
}

/**
 * The payment schedule for a term, with recorded payments applied in order.
 *
 * Charges added on top of the plan (e.g. a cross-enrollment fee, which is cash
 * basis) are shown first as "Other charges" and are paid first. Then:
 *   INSTALLMENT  : down payment, prelim, midterm, final (= what remains)
 *   EARLY_BIRD / CASH / SHS_NO_VOUCHER : one full payment
 */
export function buildPaymentSchedule(plan: PaymentPlan | null, breakdown: FeeBreakdown | null, totalAssessed: Prisma.Decimal, totalPaid: Prisma.Decimal): Installment[] {
  if (!plan || totalAssessed.lte(0)) return [];

  const zero = new Prisma.Decimal(0);
  const ownTotal = plan === "SHS_VOUCHER" ? zero : planTotal(plan, breakdown);
  // Extra charges = anything above the plan's own total. Unknown plan total (Senior High) = no extras.
  const extra = ownTotal ? Prisma.Decimal.max(totalAssessed.minus(ownTotal), 0) : zero;
  let base = totalAssessed.minus(extra);

  const parts: Array<{ label: string; amount: Prisma.Decimal }> = [];
  if (extra.gt(0)) parts.push({ label: "Other charges (e.g. cross enrollment)", amount: extra });

  if (plan === "INSTALLMENT" && breakdown) {
    // Each part takes what it needs from the plan total; the final part gets the rest.
    const take = (amount: number) => {
      const part = Prisma.Decimal.min(new Prisma.Decimal(amount), base);
      base = base.minus(part);
      return part;
    };
    parts.push(
      { label: "Down payment", amount: take(breakdown.downPayment) },
      { label: "Prelim exam payment", amount: take(breakdown.prelimPayment) },
      { label: "Midterm exam payment", amount: take(breakdown.midtermPayment) },
      { label: "Final exam payment", amount: base },
    );
  } else if (base.gt(0)) {
    const label =
      plan === "EARLY_BIRD"
        ? "Full payment (early bird — 1 month before the term starts)"
        : plan === "CASH"
          ? "Full payment (cash — up to the first day of classes)"
          : "Whole-year tuition";
    parts.push({ label, amount: base });
  }

  let left = totalPaid;
  return parts
    .filter((part) => part.amount.gt(0))
    .map((part) => {
      const paid = Prisma.Decimal.min(Prisma.Decimal.max(left, 0), part.amount);
      left = left.minus(paid);
      const remaining = part.amount.minus(paid);
      return {
        label: part.label,
        amount: part.amount.toFixed(2),
        paid: paid.toFixed(2),
        remaining: remaining.toFixed(2),
        status: remaining.lte(0) ? "PAID" : paid.gt(0) ? "PARTIAL" : "DUE",
      };
    });
}
