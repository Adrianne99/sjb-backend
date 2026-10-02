// Payment receipt — sent when the cashier records a payment.
import { longDate, peso, portalUrl, renderEmail, type EmailBlock } from "./layout";

export interface PaymentReceivedData {
  firstName: string;
  studentNumber: string;
  referenceNumber: string; // OR number
  amount: string;
  paymentDate: string; // "2026-06-29"
  paymentMethod: string; // "GCash"
  termLabel: string;
  balance: string; // remaining balance for the term
  /** The next unpaid part of the payment schedule, if any. */
  nextInstallment: { label: string; amount: string; remaining: string } | null;
  hasPortalAccount: boolean;
}

export function paymentReceivedEmail(data: PaymentReceivedData) {
  const fullyPaid = Number(data.balance) <= 0.004;
  const blocks: EmailBlock[] = [
    { type: "paragraph", text: `Hello ${data.firstName},` },
    { type: "paragraph", text: `We received your payment for the ${data.termLabel}. Thank you!` },
    {
      type: "details",
      rows: [
        ["Official receipt no.", data.referenceNumber],
        ["Amount paid", peso(data.amount)],
        ["Date", longDate(data.paymentDate)],
        ["Payment type", data.paymentMethod],
        ["Student number", data.studentNumber],
      ],
    },
  ];

  if (fullyPaid) {
    blocks.push({ type: "highlight", tone: "success", text: "Your balance for this term is fully paid." });
  } else {
    blocks.push({ type: "highlight", text: `Remaining balance for this term: ${peso(data.balance)}` });
    if (data.nextInstallment) {
      const part = data.nextInstallment;
      blocks.push({
        type: "paragraph",
        text:
          part.remaining === part.amount
            ? `Next payment: ${part.label} — ${peso(part.amount)}.`
            : `Next payment: ${part.label} — ${peso(part.remaining)} left of ${peso(part.amount)}.`,
      });
    }
  }

  blocks.push({ type: "note", text: "Keep this email as your record. Please contact the Accounting Office if any detail is wrong." });
  if (data.hasPortalAccount) blocks.push({ type: "button", label: "View my balance", url: portalUrl("/student/balance") });

  return renderEmail({
    subject: `Payment received — ${peso(data.amount)} (receipt ${data.referenceNumber})`,
    title: "Payment received",
    preheader: fullyPaid ? "Your balance is fully paid." : `Remaining balance: ${peso(data.balance)}`,
    blocks,
    audience: "student",
  });
}
