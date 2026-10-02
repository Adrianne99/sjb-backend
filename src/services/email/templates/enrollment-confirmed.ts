// "You're enrolled" — sent when an enrollment becomes ENROLLED.
import { longDate, peso, portalUrl, renderEmail, timeRange, type EmailBlock } from "./layout";

export interface EnrollmentConfirmedData {
  firstName: string;
  studentNumber: string;
  termLabel: string; // "First Semester, 2026-2027"
  classesStart: string | null; // "2026-07-07"
  program: string; // "Information Technology (IT)"
  yearLevel: string; // "1st Year" / "Grade 11"
  section: string | null;
  classes: Array<{ day: string; start: string; end: string; subject: string; where: string; withSection?: string | null }>;
  /** Present when tuition fees were already applied. */
  fees: { planLabel: string; total: string; installments: Array<{ label: string; amount: string }> } | null;
  hasPortalAccount: boolean;
}

export function enrollmentConfirmedEmail(data: EnrollmentConfirmedData) {
  const blocks: EmailBlock[] = [
    { type: "paragraph", text: `Hello ${data.firstName},` },
    { type: "paragraph", text: `You are now officially enrolled for the ${data.termLabel}. Welcome to Saint John Bosco!` },
    {
      type: "details",
      rows: [
        ["Student number", data.studentNumber],
        ["Program", data.program],
        ["Year level", data.yearLevel],
        ["Section", data.section ?? "To be assigned by the Registrar"],
        ...(data.classesStart ? ([["Start of classes", longDate(data.classesStart)]] as Array<[string, string]>) : []),
      ],
    },
  ];

  if (data.classes.length > 0) {
    blocks.push(
      { type: "heading", text: "Your class schedule" },
      {
        type: "table",
        columns: ["When", "Subject", "Room"],
        noWrap: [0],
        rows: data.classes.map((item) => [
          `${item.day}\n${timeRange(item.start, item.end)}`,
          item.withSection ? `${item.subject}\n(with ${item.withSection})` : item.subject,
          item.where,
        ]),
      },
    );
  } else {
    blocks.push({ type: "note", text: "Your class schedule will appear in the Student Portal once your section is assigned." });
  }

  blocks.push({ type: "heading", text: "Tuition" });
  if (data.fees) {
    blocks.push({
      type: "details",
      rows: [
        ["Payment option", data.fees.planLabel],
        ["Total for this term", peso(data.fees.total)],
        ...data.fees.installments.map((part) => [part.label, peso(part.amount)] as [string, string]),
      ],
    });
  } else {
    blocks.push({ type: "paragraph", text: "Your tuition assessment will be shown in the Student Portal under Balance & Payments. Payments are made at the Accounting Office." });
  }

  blocks.push(
    { type: "heading", text: "Before the first day" },
    { type: "paragraph", text: "Please arrive 15 minutes early, wear proper attire and follow school rules." },
  );
  if (data.hasPortalAccount) blocks.push({ type: "button", label: "Open my Student Portal", url: portalUrl("/student/schedule") });
  else blocks.push({ type: "note", text: "Ask the Registrar's Office for your Student Portal account to see your schedule, grades and balance online." });

  return renderEmail({
    subject: `You're enrolled — ${data.termLabel}`,
    title: "You're officially enrolled",
    preheader: `${data.program} · ${data.yearLevel}${data.section ? ` · ${data.section}` : ""}`,
    blocks,
    audience: "student",
  });
}
