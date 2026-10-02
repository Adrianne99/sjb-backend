// "New grades are available" — sent when grades are published.
// For privacy the email lists only the SUBJECTS, never the grades themselves:
// the student logs in to see them.
import { portalUrl, renderEmail, type EmailBlock } from "./layout";

export interface GradesPublishedData {
  firstName: string;
  termLabel: string;
  subjects: Array<{ code: string; name: string }>;
  hasPortalAccount: boolean;
}

export function gradesPublishedEmail(data: GradesPublishedData) {
  const blocks: EmailBlock[] = [
    { type: "paragraph", text: `Hello ${data.firstName},` },
    {
      type: "paragraph",
      text: `New grades for the ${data.termLabel} have been released for ${data.subjects.length === 1 ? "this subject" : "these subjects"}:`,
    },
    { type: "table", columns: ["Code", "Subject"], rows: data.subjects.map((subject) => [subject.code, subject.name]) },
  ];

  if (data.hasPortalAccount) {
    blocks.push(
      { type: "paragraph", text: "Log in to the Student Portal to see your grades and report card." },
      { type: "button", label: "View my grades", url: portalUrl("/student/grades") },
    );
  } else {
    blocks.push({ type: "paragraph", text: "Please visit the Registrar's Office to view your grades, or ask for a Student Portal account." });
  }
  blocks.push({ type: "note", text: "For your privacy, grades are not included in this email. Questions about a grade? Please talk to your instructor or the Registrar's Office." });

  return renderEmail({
    subject: `New grades available — ${data.termLabel}`,
    title: "New grades are available",
    preheader: data.subjects.map((subject) => subject.code).join(", "),
    blocks,
    audience: "student",
  });
}
