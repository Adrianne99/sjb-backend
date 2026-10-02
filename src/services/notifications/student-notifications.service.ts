// =============================================================================
// Automatic emails to students:
//   - enrollment confirmed     (enrollment becomes ENROLLED)
//   - payment received         (cashier records a payment)
//   - grades published         (staff publish grades)
//   - school announcement      (an announcement is published and live)
//
// Rules:
//   - Emails are sent AFTER the database change is saved, in the background,
//     with `notifyLater`. A failed email is logged and never breaks the request.
//   - Address: the portal account email, or else the profile email.
//     Archived students and students without an email get nothing.
//   - Students with a portal account can turn these emails off in Settings:
//     notifySchoolRecords (enrollment, payments, grades) and
//     notifyAnnouncements (announcements).
// The wording/design of each email is in services/email/templates/.
// =============================================================================
import { prisma } from "../../config/database";
import type { DayOfWeek, PaymentMethod, PaymentPlan, Prisma } from "../../generated/prisma/client";
import { whereLabel } from "../../mappers/schedule.mapper";
import * as scheduleRepository from "../../repositories/schedule.repository";
import { logger } from "../../utils/logger";
import { toDecimal } from "../../utils/money";
import { yearLevelLabel } from "../../utils/year-levels";
import { sendEmail, sendEmailBatch } from "../email/resend.service";
import { announcementEmail } from "../email/templates/announcement";
import { enrollmentConfirmedEmail } from "../email/templates/enrollment-confirmed";
import { gradesPublishedEmail } from "../email/templates/grades-published";
import { paymentReceivedEmail } from "../email/templates/payment-received";
import { buildPaymentSchedule, PLAN_LABELS } from "../fees/fee-calculator";
import { readBreakdown } from "../fees/fee.service";
import { getBalancesForEnrollments } from "../payments/balance.service";

// --- Running emails in the background -------------------------------------------

const pending = new Set<Promise<void>>();

/** Starts an email task without making the caller wait. Errors are logged. */
export function notifyLater(label: string, task: () => Promise<unknown>) {
  const running: Promise<void> = Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      (error: unknown) => logger.error(`Email notification failed (${label})`, { error: (error as Error).message }),
    )
    .finally(() => pending.delete(running));
  pending.add(running);
}

/** Waits until every background email has finished (used by tests). */
export async function flushNotifications() {
  while (pending.size > 0) await Promise.all([...pending]);
}

// --- Who receives the email -------------------------------------------------------

const studentWithContact = { user: true, profile: true } satisfies Prisma.StudentInclude;
type StudentWithContact = Prisma.StudentGetPayload<{ include: typeof studentWithContact }>;

interface Recipient {
  email: string;
  firstName: string;
  hasPortalAccount: boolean;
}

function recipientFor(student: StudentWithContact, kind: "records" | "announcements"): Recipient | null {
  if (student.status === "ARCHIVED") return null;
  const email = student.user?.email ?? student.profile?.email ?? null;
  if (!email) return null;
  if (student.user) {
    const wantsIt = kind === "records" ? student.user.notifySchoolRecords : student.user.notifyAnnouncements;
    if (!wantsIt) return null;
  }
  return { email, firstName: student.firstName, hasPortalAccount: Boolean(student.user?.isActive) };
}

const DAY_NAMES: Record<DayOfWeek, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

const PAYMENT_METHOD_NAMES: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  GCASH: "GCash",
  MAYA: "Maya",
  CHECK: "Check",
  OTHER: "Other",
};

const termLabelOf = (semester: { name: string; academicYear: { name: string } }) => `${semester.name}, ${semester.academicYear.name}`;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

/** The payment schedule of an enrollment, with recorded payments applied. */
async function paymentScheduleOf(enrollment: { id: number; paymentPlan: PaymentPlan | null; feeBreakdown: Prisma.JsonValue }) {
  const balance = (await getBalancesForEnrollments([enrollment.id])).get(enrollment.id)!;
  const schedule = buildPaymentSchedule(enrollment.paymentPlan, readBreakdown(enrollment.feeBreakdown), toDecimal(balance.totalAssessed), toDecimal(balance.totalPaid));
  return { balance, schedule };
}

// --- 1. Enrollment confirmed ----------------------------------------------------------

export async function notifyEnrollmentConfirmed(enrollmentId: number) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { student: { include: studentWithContact }, program: true, section: true, semester: { include: { academicYear: true } }, extraSubjects: true },
  });
  if (!enrollment || enrollment.status !== "ENROLLED") return;
  const recipient = recipientFor(enrollment.student, "records");
  if (!recipient) return;

  const slots = await scheduleRepository.findSlotsForStudent(enrollment.semesterId, enrollment.sectionId, enrollment.extraSubjects);
  const { balance, schedule } = await paymentScheduleOf(enrollment);

  const email = enrollmentConfirmedEmail({
    firstName: recipient.firstName,
    studentNumber: enrollment.student.studentNumber,
    termLabel: termLabelOf(enrollment.semester),
    classesStart: enrollment.semester.startDate ? isoDate(enrollment.semester.startDate) : null,
    program: `${enrollment.program.name} (${enrollment.program.code})`,
    yearLevel: yearLevelLabel(enrollment.yearLevel),
    section: enrollment.section?.name ?? null,
    classes: slots.map((slot) => ({
      day: DAY_NAMES[slot.dayOfWeek],
      start: slot.startTime,
      end: slot.endTime,
      subject: `${slot.subject.code} ${slot.subject.name}`,
      where: whereLabel(slot),
      withSection: slot.sectionId !== enrollment.sectionId ? slot.section.name : null,
    })),
    fees: enrollment.paymentPlan
      ? { planLabel: PLAN_LABELS[enrollment.paymentPlan], total: balance.totalAssessed, installments: schedule.map((part) => ({ label: part.label, amount: part.amount })) }
      : null,
    hasPortalAccount: recipient.hasPortalAccount,
  });
  await sendEmail({ to: recipient.email, ...email });
}

// --- 2. Payment received ------------------------------------------------------------

export async function notifyPaymentReceived(paymentId: number) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { enrollment: { include: { student: { include: studentWithContact }, semester: { include: { academicYear: true } } } } },
  });
  if (!payment || payment.status !== "RECORDED") return;
  const recipient = recipientFor(payment.enrollment.student, "records");
  if (!recipient) return;

  const { balance, schedule } = await paymentScheduleOf(payment.enrollment);
  const next = schedule.find((part) => part.status !== "PAID");

  const email = paymentReceivedEmail({
    firstName: recipient.firstName,
    studentNumber: payment.enrollment.student.studentNumber,
    referenceNumber: payment.referenceNumber,
    amount: payment.amount.toFixed(2),
    paymentDate: isoDate(payment.paymentDate),
    paymentMethod: PAYMENT_METHOD_NAMES[payment.paymentMethod],
    termLabel: termLabelOf(payment.enrollment.semester),
    balance: balance.balance,
    nextInstallment: next ? { label: next.label, amount: next.amount, remaining: next.remaining } : null,
    hasPortalAccount: recipient.hasPortalAccount,
  });
  await sendEmail({ to: recipient.email, ...email });
}

// --- 3. Grades published ------------------------------------------------------------

/** One email per student, listing the subjects whose grades were just published. */
export async function notifyGradesPublished(gradeIds: number[]) {
  if (gradeIds.length === 0) return;
  const grades = await prisma.grade.findMany({
    where: { id: { in: gradeIds }, status: "PUBLISHED" },
    include: { subject: true, enrollment: { include: { student: { include: studentWithContact }, semester: { include: { academicYear: true } } } } },
  });

  const byEnrollment = new Map<number, typeof grades>();
  for (const grade of grades) byEnrollment.set(grade.enrollmentId, [...(byEnrollment.get(grade.enrollmentId) ?? []), grade]);

  for (const studentGrades of byEnrollment.values()) {
    const { enrollment } = studentGrades[0];
    const recipient = recipientFor(enrollment.student, "records");
    if (!recipient) continue;
    const email = gradesPublishedEmail({
      firstName: recipient.firstName,
      termLabel: termLabelOf(enrollment.semester),
      subjects: studentGrades.map((grade) => ({ code: grade.subject.code, name: grade.subject.name })),
      hasPortalAccount: recipient.hasPortalAccount,
    });
    await sendEmail({ to: recipient.email, ...email });
  }
}

// --- 4. Announcements -------------------------------------------------------------------

let sendingAnnouncements = false;

/**
 * Emails every PUBLISHED announcement that is live now and was not emailed yet.
 * Called after an announcement is saved, and every few minutes by server.ts
 * (so announcements with a future publish date are sent when they go live).
 * Each announcement is emailed only once.
 */
export async function sendDueAnnouncementEmails(now = new Date()) {
  if (sendingAnnouncements) return;
  sendingAnnouncements = true;
  try {
    const due = await prisma.announcement.findMany({
      where: { status: "PUBLISHED", emailedAt: null, publishDate: { lte: now }, OR: [{ expirationDate: null }, { expirationDate: { gt: now } }] },
      orderBy: { publishDate: "asc" },
      omit: { imageData: true },
    });
    if (due.length === 0) return;

    const students = await prisma.student.findMany({ where: { status: "ACTIVE" }, include: studentWithContact });
    const recipients = students.map((student) => recipientFor(student, "announcements")).filter((recipient): recipient is Recipient => recipient !== null);

    for (const announcement of due) {
      // Claim it first, so it can never be emailed twice (even by two servers).
      const claimed = await prisma.announcement.updateMany({ where: { id: announcement.id, emailedAt: null }, data: { emailedAt: new Date() } });
      if (claimed.count === 0) continue;

      const email = announcementEmail({ title: announcement.title, content: announcement.content, publishDate: isoDate(announcement.publishDate) });
      const sent = await sendEmailBatch(recipients.map((recipient) => ({ to: recipient.email, ...email })));
      logger.info(`Announcement "${announcement.title}" emailed to ${sent} of ${recipients.length} student(s).`);
    }
  } finally {
    sendingAnnouncements = false;
  }
}
