// Emails to a TEACHER about grades they submitted for review:
//   - returned for changes (with the Registrar's note)
//   - published to students
import { portalUrl, renderEmail, type EmailBlock } from "./layout";

export interface GradeReviewData {
  firstName: string;
  classLabel: string; // e.g. "IT101 Introduction to Computing — IT 1-A"
  termLabel: string;
  outcome: "RETURNED" | "PUBLISHED";
  note?: string | null;
}

export function gradeReviewEmail(data: GradeReviewData) {
  const returned = data.outcome === "RETURNED";
  const blocks: EmailBlock[] = [
    { type: "paragraph", text: `Hello ${data.firstName},` },
    {
      type: "paragraph",
      text: returned
        ? `The Registrar's Office returned your grades for ${data.classLabel} (${data.termLabel}) so you can make changes.`
        : `Your grades for ${data.classLabel} (${data.termLabel}) were reviewed and published. Students can now see them.`,
    },
  ];
  if (returned && data.note) blocks.push({ type: "note", text: `Note from the Registrar's Office: ${data.note}` });
  blocks.push({ type: "button", label: returned ? "Open My Classes" : "View my classes", url: portalUrl("/admin/my-classes") });

  return renderEmail({
    subject: returned ? `Grades returned for changes — ${data.classLabel}` : `Grades published — ${data.classLabel}`,
    title: returned ? "Grades returned for changes" : "Grades published",
    preheader: data.classLabel,
    blocks,
    audience: "account",
  });
}
