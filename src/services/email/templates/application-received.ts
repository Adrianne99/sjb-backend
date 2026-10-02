// "We received your application" — sent after the online pre-registration form.
import { portalUrl, renderEmail, type EmailBlock } from "./layout";

export interface ApplicationReceivedData {
  firstName: string;
  referenceNumber: string;
  program: string; // "Information Technology (IT)"
  yearLevel: string; // "1st Year" / "Grade 11"
  /** Documents to bring (from Settings → Requirements). */
  requirements: string[];
  /** One line about fees for their program, e.g. the down payment. */
  feeNote: string | null;
}

export function applicationReceivedEmail(data: ApplicationReceivedData) {
  const blocks: EmailBlock[] = [
    { type: "paragraph", text: `Hello ${data.firstName},` },
    { type: "paragraph", text: "Thank you for applying to Saint John Bosco Institute of Arts and Sciences! We received your pre-registration." },
    { type: "highlight", text: `Your reference number: ${data.referenceNumber}` },
    { type: "details", rows: [["Program", data.program], ["Year level", data.yearLevel]] },
    { type: "heading", text: "Next steps" },
    {
      type: "paragraph",
      text:
        "1. Visit the Registrar's Office and give your reference number.\n" +
        "2. Bring the original documents listed below.\n" +
        "3. Pay at the Accounting Office (down payment or full payment).\n" +
        "4. Once you are officially enrolled, we will email your class schedule and your Student Portal login.",
    },
  ];
  if (data.requirements.length > 0) {
    blocks.push({ type: "heading", text: "Documents to bring" }, { type: "table", columns: ["Document"], rows: data.requirements.map((name) => [name]) });
  }
  if (data.feeNote) blocks.push({ type: "heading", text: "Fees" }, { type: "paragraph", text: data.feeNote });
  blocks.push(
    { type: "button", label: "See tuition fees and admission steps", url: portalUrl("/#admissions") },
    { type: "note", text: "This is a pre-registration only — your enrollment is confirmed after your documents are checked and your payment is recorded at the school." },
  );

  return renderEmail({
    subject: `Application received — ${data.referenceNumber}`,
    title: "We received your application",
    preheader: `Reference number ${data.referenceNumber}. Bring your documents to the Registrar's Office.`,
    blocks,
    audience: "account",
  });
}
