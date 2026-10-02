// Preview every email template WITHOUT sending anything.
//
//   npm run email:preview
//
// Writes one HTML file per email (plus a .txt plain-text version) to
// backend/email-previews/ — open the .html files in your browser.
// All names and numbers below are FICTIONAL sample data.
import fs from "node:fs";
import path from "node:path";
import { renderEmail } from "../src/services/email/templates/layout";
import { announcementEmail } from "../src/services/email/templates/announcement";
import { enrollmentConfirmedEmail } from "../src/services/email/templates/enrollment-confirmed";
import { gradesPublishedEmail } from "../src/services/email/templates/grades-published";
import { paymentReceivedEmail } from "../src/services/email/templates/payment-received";

// Saved next to package.json (run the script from the backend folder).
const outDir = path.resolve(process.cwd(), "email-previews");
fs.mkdirSync(outDir, { recursive: true });

const previews = {
  "1-enrollment-confirmed": enrollmentConfirmedEmail({
    firstName: "Juan",
    studentNumber: "2026-0001",
    termLabel: "First Semester, 2026-2027",
    classesStart: "2026-07-07",
    program: "Information Technology (IT)",
    yearLevel: "1st Year",
    section: "IT 1-A",
    classes: [
      { day: "Monday", start: "13:00", end: "14:30", subject: "PE101 Gymnastics", where: "101" },
      { day: "Monday", start: "14:30", end: "16:00", subject: "GE101 Understanding the Self", where: "101" },
      { day: "Tuesday", start: "13:00", end: "14:30", subject: "GE107 Science, Technology and Society", where: "101" },
      { day: "Tuesday", start: "14:30", end: "16:00", subject: "GE103 Mathematics in the Modern World", where: "101" },
      { day: "Wednesday", start: "13:00", end: "14:30", subject: "GE105 Purposive Communication", where: "101" },
      { day: "Wednesday", start: "14:30", end: "16:00", subject: "NSTP101 National Service Training Program 1", where: "101" },
      { day: "Thursday", start: "16:00", end: "17:30", subject: "IT101 Introduction to Computing", where: "Online" },
      { day: "Thursday", start: "18:00", end: "19:30", subject: "IT102 C Programming", where: "Online" },
    ],
    fees: {
      planLabel: "Installment",
      total: "9860.00",
      installments: [
        { label: "Down payment", amount: "2000.00" },
        { label: "Prelim exam payment", amount: "2870.00" },
        { label: "Midterm exam payment", amount: "2870.00" },
        { label: "Final exam payment", amount: "2120.00" },
      ],
    },
    hasPortalAccount: true,
  }),
  "2-payment-received": paymentReceivedEmail({
    firstName: "Juan",
    studentNumber: "2026-0001",
    referenceNumber: "OR-2026-01010",
    amount: "2000.00",
    paymentDate: "2026-06-29",
    paymentMethod: "GCash",
    termLabel: "First Semester, 2026-2027",
    balance: "7860.00",
    nextInstallment: { label: "Prelim exam payment", amount: "2870.00", remaining: "2870.00" },
    hasPortalAccount: true,
  }),
  "3-grades-published": gradesPublishedEmail({
    firstName: "Angela",
    termLabel: "First Semester, 2026-2027",
    subjects: [
      { code: "IT104", name: "Data Structures and Algorithms" },
      { code: "IT114", name: "Information Assurance and Security 1" },
    ],
    hasPortalAccount: true,
  }),
  "4-announcement": announcementEmail({
    title: "Start of classes — July 7, 2026",
    content:
      "Good day, Johnians!\n\nClasses for the First Semester of School Year 2026-2027 start on July 7, 2026. Kindly check your assigned year level, section and class schedule in the Student Portal.\n\nPlease arrive 15 minutes early, wear proper attire and follow school rules.",
    publishDate: "2026-07-01",
  }),
  "5-account-created": renderEmail({
    subject: "Your student portal account is ready",
    title: "Your student portal account is ready",
    audience: "account",
    blocks: [
      { type: "paragraph", text: "Hello Juan Dela Cruz," },
      { type: "paragraph", text: "Your student portal account has been created." },
      { type: "details", rows: [["Username", "2026-0001"], ["Temporary password", "Your birthdate in MMDDYYYY format\n(example: January 1, 2001 = 01012001)"]] },
      { type: "button", label: "Go to the portal", url: "http://localhost:5173/login" },
    ],
  }),
};

for (const [name, email] of Object.entries(previews)) {
  fs.writeFileSync(path.join(outDir, `${name}.html`), email.html);
  fs.writeFileSync(path.join(outDir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`);
  console.log(`✉️  ${name}.html — "${email.subject}"`);
}
console.log(`\nOpen the files in ${outDir}`);
