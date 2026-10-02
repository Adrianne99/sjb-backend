// Builds the "SCHOOL INFORMATION" text the AI answers from.
//
// It combines the hand-written facts (school-info.ts) with PUBLIC data the
// school already manages in the app: programs, admission requirements,
// tuition fees and public announcements. Nothing private (students, grades,
// payments, staff) is ever included.
import { listPrograms } from "../academic/academic.service";
import { listPublicAnnouncements } from "../announcements/announcement.service";
import { listPublicFees } from "../fees/fee.service";
import { listPublicRequirements } from "../requirements/requirement.service";
import { SCHOOL_FACTS, SCHOOL_PROFILE } from "./school-info";

const peso = (value: string | number) => `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Keeps the prompt small: long announcement text is shortened. */
const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

async function programsSection() {
  const programs = (await listPrograms()).filter((program) => program.isActive);
  if (!programs.length) return "No programs are listed yet.";
  return programs
    .map((program) => {
      const levels = /senior high/i.test(program.level) ? "Grade 11 and Grade 12" : program.yearLevels.map((level) => `Year ${level}`).join(", ");
      return `- ${program.name} (${program.code}), ${program.level}: ${levels}.${program.description ? ` ${program.description}` : ""}`;
    })
    .join("\n");
}

async function requirementsSection() {
  const requirements = await listPublicRequirements();
  if (!requirements.length) return "Ask the Registrar's Office for the list.";
  return requirements.map((item) => `- ${item.name}${item.description ? `: ${item.description}` : ""}`).join("\n");
}

async function feesSection() {
  const { schedules, crossEnrollmentFee } = await listPublicFees();
  const lines: string[] = [];
  for (const row of schedules) {
    if (row.annualTuition !== null) {
      lines.push(`- ${row.programName} ${row.yearLevelLabel}: free tuition with a Senior High voucher; ${peso(row.annualTuition)} for the whole school year without a voucher.`);
    } else {
      lines.push(
        `- ${row.programName} (${row.programCode}) ${row.yearLevelLabel}, per term: ${row.units} units × ${peso(row.ratePerUnit)} + ${peso(row.miscFee)} miscellaneous fee = ${peso(row.total)}. ` +
          `Installment: down payment ${peso(row.downPayment)}, prelim ${peso(row.prelimPayment)}, midterm ${peso(row.midtermPayment)}, final ${peso(row.finalPayment)}. ` +
          `Early bird (paid in full 1 month before the term starts): ${peso(row.earlyBirdTotal)}. Cash (paid in full up to the first day of classes): ${peso(row.cashTotal)}.`,
      );
    }
  }
  lines.push(`- Cross-enrollment fee: ${peso(crossEnrollmentFee)} per 3-unit subject, cash basis only.`);
  lines.push("- Units may vary depending on the semester taken.");
  return lines.join("\n");
}

async function announcementsSection() {
  const announcements = await listPublicAnnouncements(5);
  if (!announcements.length) return "No current public announcements.";
  return announcements.map((item) => `- ${item.title} (posted ${item.publishDate.slice(0, 10)}): ${shorten(item.content.replace(/\s+/g, " "), 300)}`).join("\n");
}

function factsSection() {
  return SCHOOL_FACTS.map((fact) => `- ${fact.topic}${fact.confirmed ? "" : " [NOT YET CONFIRMED]"}: ${fact.details.replace(/SAMPLE:\s*/gi, "")}`).join("\n");
}

/** The full public school information, as plain text for the AI. */
export async function buildSchoolContext(): Promise<string> {
  const [programs, requirements, fees, announcements] = await Promise.all([programsSection(), requirementsSection(), feesSection(), announcementsSection()]);
  const today = new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" });

  return [
    `SCHOOL INFORMATION — ${SCHOOL_PROFILE.name}, ${SCHOOL_PROFILE.location}. Today is ${today}.`,
    `\nPROGRAMS OFFERED:\n${programs}`,
    `\nADMISSION REQUIREMENTS (submit to the Registrar's Office):\n${requirements}`,
    `\nTUITION FEES:\n${fees}`,
    `\nPUBLIC ANNOUNCEMENTS:\n${announcements}`,
    `\nOTHER SCHOOL INFORMATION:\n${factsSection()}`,
  ].join("\n");
}
