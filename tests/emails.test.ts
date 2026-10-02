// Automatic student emails. The Resend sender is replaced by a fake that just
// records the messages, so these tests never send real email.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/config/database";
import { announcementEmail } from "../src/services/email/templates/announcement";
import { gradesPublishedEmail } from "../src/services/email/templates/grades-published";
import { flushNotifications, sendDueAnnouncementEmails } from "../src/services/notifications/student-notifications.service";
import { CREDENTIALS, loginAs, type TestAgent } from "./helpers";

type Message = { to: string; subject: string; html: string; text: string };
const mail = vi.hoisted(() => ({ sent: [] as Message[], batches: [] as Message[][] }));

vi.mock("../src/services/email/resend.service", () => ({
  sendEmail: async (message: Message) => {
    mail.sent.push(message);
    return true;
  },
  sendEmailBatch: async (messages: Message[]) => {
    mail.batches.push(messages);
    return messages.length;
  },
}));

const EMAIL = "mail.tester@example.com";

/** Emails sent to our test student since the last reset. */
const toTester = () => mail.sent.filter((message) => message.to === EMAIL);

describe("Email templates", () => {
  it("escapes HTML and always includes a plain-text version", () => {
    const email = announcementEmail({ title: "<script>alert(1)</script> Class suspension", content: "No classes <b>today</b>.\nStay safe.", publishDate: "2026-07-01" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&#60;script&#62;");
    expect(email.html).toContain("Stay safe.");
    expect(email.text).toContain("No classes <b>today</b>.");
    expect(email.html).toContain("Saint John Bosco Institute of Arts and Sciences");
  });

  it("never puts grade values in the grades email", () => {
    const email = gradesPublishedEmail({ firstName: "Juan", termLabel: "First Semester, 2026-2027", subjects: [{ code: "GE101", name: "Understanding the Self" }], hasPortalAccount: true });
    expect(email.subject).toBe("New grades available — First Semester, 2026-2027");
    expect(email.text).toContain("GE101");
    expect(email.text).not.toMatch(/\b[1-5]\.\d{2}\b/);
  });
});

describe("Automatic student emails", () => {
  let staff: TestAgent;
  let enrollmentId: number;
  let studentUserId: number;
  let termId: number;
  let sectionId: number;

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.registrar);
    const term = (await staff.get("/api/academic/current-term")).body.data;
    termId = term.id;
    const sections = (await staff.get(`/api/academic/sections?academicYearId=${term.academicYearId}`)).body.data;
    sectionId = sections.find((section: { name: string }) => section.name === "IT 1-A").id;
    const programs = (await staff.get("/api/academic/programs")).body.data;

    // A new student who is still PENDING (no email yet).
    const created = await staff.post("/api/students", {
      firstName: "Mail",
      lastName: "Tester",
      dateOfBirth: "2008-03-03",
      sex: "MALE",
      programId: programs.find((program: { code: string }) => program.code === "IT").id,
      profile: { email: EMAIL },
      initialEnrollment: { semesterId: termId, yearLevel: 1, sectionId, status: "PENDING" },
      createAccount: true,
    });
    expect(created.status).toBe(201);
    enrollmentId = created.body.data.student.currentEnrollment.id;
    studentUserId = (await prisma.student.findUniqueOrThrow({ where: { id: created.body.data.student.id } })).userId!;
    await flushNotifications();
  });

  beforeEach(() => {
    mail.sent.length = 0;
    mail.batches.length = 0;
  });

  const enroll = () => staff.put(`/api/enrollments/${enrollmentId}`, { status: "ENROLLED", yearLevel: 1, sectionId, enrollmentDate: "2026-06-29", remarks: null });

  it("sends 'You're enrolled' with the class schedule when the enrollment becomes ENROLLED (once)", async () => {
    expect((await enroll()).status).toBe(200);
    await flushNotifications();
    expect(toTester()).toHaveLength(1);
    const [email] = toTester();
    expect(email.subject).toBe("You're enrolled — First Semester, 2026-2027");
    expect(email.text).toContain("IT 1-A");
    expect(email.text).toContain("July 7, 2026");
    expect(email.text).toContain("GE101 Understanding the Self");
    expect(email.text).toContain("Online"); // IT101 / IT102 are online classes

    // Saving again (still ENROLLED) does not send another email.
    expect((await enroll()).status).toBe(200);
    await flushNotifications();
    expect(toTester()).toHaveLength(1);
  });

  it("emails a receipt with the remaining balance and next installment when a payment is recorded", async () => {
    expect((await staff.post(`/api/enrollments/${enrollmentId}/apply-fees`, { plan: "INSTALLMENT" })).status).toBe(200);
    const recorded = await staff.post("/api/payments", { enrollmentId, amount: 2000, paymentDate: "2026-06-29", paymentMethod: "GCASH", referenceNumber: "OR-MAIL-0001" });
    expect(recorded.status).toBe(201);
    await flushNotifications();

    const receipt = toTester().find((message) => message.subject.startsWith("Payment received"));
    expect(receipt?.subject).toBe("Payment received — ₱2,000.00 (receipt OR-MAIL-0001)");
    // Same balance the staff sees (the fee table may differ if another test edited it).
    const balance = Number((await staff.get(`/api/enrollments/${enrollmentId}`)).body.data.balance.balance);
    const expected = `₱${balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
    expect(receipt?.text).toContain(`Remaining balance for this term: ${expected}`);
    expect(receipt?.text).toContain("Next payment: Prelim exam payment — ₱2,870.00.");
  });

  it("tells the student new grades are available when a grade is published (without the grade)", async () => {
    const subjects = (await staff.get("/api/academic/subjects")).body.data;
    const ge101 = subjects.find((subject: { code: string }) => subject.code === "GE101");
    const draft = await staff.post("/api/grades", { enrollmentId, subjectId: ge101.id, grade: 1.75 });
    expect(draft.status).toBe(201);
    await flushNotifications();
    expect(toTester()).toHaveLength(0); // drafts are never emailed

    expect((await staff.post(`/api/grades/${draft.body.data.id}/publish`)).status).toBe(200);
    await flushNotifications();
    expect(toTester()).toHaveLength(1);
    expect(toTester()[0].text).toContain("GE101");
    expect(toTester()[0].text).not.toContain("1.75");
  });

  it("respects the student's 'Enrollment, payments and grades' preference", async () => {
    await prisma.user.update({ where: { id: studentUserId }, data: { notifySchoolRecords: false } });
    await staff.post("/api/payments", { enrollmentId, amount: 500, paymentDate: "2026-07-01", paymentMethod: "CASH" });
    await flushNotifications();
    expect(toTester()).toHaveLength(0);
    await prisma.user.update({ where: { id: studentUserId }, data: { notifySchoolRecords: true } });
  });

  it("emails a published announcement to students once, and future ones when they go live", async () => {
    const live = await staff.post("/api/announcements", {
      title: "Test: no classes tomorrow",
      content: "Classes are suspended.",
      audience: "STUDENTS",
      status: "PUBLISHED",
      publishDate: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(live.status).toBe(201);
    await flushNotifications();
    expect(mail.batches).toHaveLength(1);
    expect(mail.batches[0].map((message) => message.to)).toContain(EMAIL);
    expect(mail.batches[0][0].subject).toBe("Announcement: Test: no classes tomorrow");

    // Editing it again does not email it again.
    await staff.put(`/api/announcements/${live.body.data.id}`, { ...live.body.data, content: "Classes are suspended (updated)." });
    await flushNotifications();
    expect(mail.batches).toHaveLength(1);

    // A future announcement waits until its publish date.
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await staff.post("/api/announcements", { title: "Test: later", content: "Soon.", audience: "PUBLIC", status: "PUBLISHED", publishDate: later.toISOString() });
    await flushNotifications();
    expect(mail.batches).toHaveLength(1);
    await sendDueAnnouncementEmails(new Date(later.getTime() + 1000));
    expect(mail.batches).toHaveLength(2);
    expect(mail.batches[1][0].subject).toBe("Announcement: Test: later");
  });
});
