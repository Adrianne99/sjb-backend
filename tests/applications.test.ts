// Online pre-registration: apply -> Registrar converts -> enrolled -> account.
// Emails are captured by a fake sender (nothing is really sent).
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/config/database";
import { flushNotifications } from "../src/services/notifications/student-notifications.service";
import { app, CREDENTIALS, loginAs, type TestAgent } from "./helpers";

type Message = { to: string; subject: string; html: string; text: string };
const mail = vi.hoisted(() => ({ sent: [] as Message[] }));
vi.mock("../src/services/email/resend.service", () => ({
  sendEmail: async (message: Message) => {
    mail.sent.push(message);
    return true;
  },
  sendEmailBatch: async (messages: Message[]) => messages.length,
}));

const EMAIL = "new.applicant@example.com";

describe("Online pre-registration (Enroll Now)", () => {
  let staff: TestAgent;
  let form: Record<string, unknown>;
  let applicationId: number;

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.registrar);
    const options = (await request(app).get("/api/applications/form-options")).body.data;
    const it = options.programs.find((program: { code: string }) => program.code === "IT");
    form = {
      firstName: "Bea",
      lastName: "Applicant",
      dateOfBirth: "2008-05-05",
      sex: "FEMALE",
      email: EMAIL,
      contactNumber: "0917 123 4567",
      guardianName: "Rosa Applicant",
      programId: it.id,
      yearLevel: 1,
      applicantType: "NEW",
      previousSchool: "Sample National High School",
      privacyConsent: true,
      website: "",
    };
  });

  beforeEach(() => {
    mail.sent.length = 0;
  });

  it("gives the public form its programs, year levels and documents", async () => {
    const response = await request(app).get("/api/applications/form-options");
    expect(response.status).toBe(200);
    const shs = response.body.data.programs.find((program: { code: string }) => program.code === "SHS");
    expect(shs.yearLevels.map((level: { label: string }) => level.label)).toEqual(["Grade 11", "Grade 12"]);
    expect(response.body.data.requirements.map((item: { name: string }) => item.name)).toContain("Report Card (Form 138)");
  });

  it("rejects incomplete or invalid applications", async () => {
    expect((await request(app).post("/api/applications").send({ ...form, privacyConsent: false })).status).toBe(422);
    expect((await request(app).post("/api/applications").send({ ...form, yearLevel: 3 })).status).toBe(422); // IT has 1st–2nd year only
    expect((await request(app).post("/api/applications").send({ ...form, email: "not-an-email" })).status).toBe(422);
    expect((await request(app).post("/api/applications").send({ ...form, website: "http://spam.example" })).status).toBe(422); // honeypot
  });

  it("accepts an application, gives a reference number and emails what to bring", async () => {
    const response = await request(app).post("/api/applications").send(form);
    expect(response.status).toBe(201);
    expect(response.body.data.referenceNumber).toMatch(/^APP-\d{4}-\d{5}$/);
    expect(response.body.data).not.toHaveProperty("contactNumber"); // only what the applicant needs

    await flushNotifications();
    const email = mail.sent.find((message) => message.to === EMAIL);
    expect(email?.subject).toBe(`Application received — ${response.body.data.referenceNumber}`);
    expect(email?.text).toContain("Form 137");
    expect(email?.text).toContain("Down payment: ₱2,000.00");

    // The same person cannot submit twice while the first is waiting.
    expect((await request(app).post("/api/applications").send(form)).status).toBe(409);
  });

  it("is visible only to staff", async () => {
    expect((await request(app).get("/api/applications")).status).toBe(401);
    const student = await loginAs(CREDENTIALS.angela);
    expect((await student.get("/api/applications")).status).toBe(403);

    const list = await staff.get("/api/applications?status=SUBMITTED&search=Applicant");
    expect(list.status).toBe(200);
    expect(list.body.meta.waiting).toBeGreaterThanOrEqual(1);
    applicationId = list.body.data[0].id;
    expect(list.body.data[0]).toMatchObject({ fullName: "Bea Applicant", status: "SUBMITTED", yearLevelLabel: "1st Year" });
  });

  it("converts the application into a student + PENDING enrollment (no retyping), only once", async () => {
    const term = (await staff.get("/api/academic/current-term")).body.data;
    const converted = await staff.post(`/api/applications/${applicationId}/convert`, { semesterId: term.id, sectionId: null });
    expect(converted.status).toBe(200);
    expect(converted.body.data.application.status).toBe("CONVERTED");
    const student = converted.body.data.student;
    expect(student).toMatchObject({ firstName: "Bea", lastName: "Applicant" });
    expect(student.profile.email).toBe(EMAIL);
    expect(student.currentEnrollment.status).toBe("PENDING");
    expect(student.account).toBeNull(); // the account comes after payment

    expect((await staff.post(`/api/applications/${applicationId}/convert`, { semesterId: term.id })).status).toBe(409);
  });

  it("creates and emails the portal account once the enrollment becomes ENROLLED (after payment)", async () => {
    const application = (await staff.get(`/api/applications/${applicationId}`)).body.data;
    const studentId = application.student.id;
    const enrollmentId = (await staff.get(`/api/students/${studentId}`)).body.data.currentEnrollment.id;

    const enrolled = await staff.put(`/api/enrollments/${enrollmentId}`, { status: "ENROLLED", yearLevel: 1, sectionId: null, enrollmentDate: "2026-07-01", remarks: null });
    expect(enrolled.status).toBe(200);
    await flushNotifications();

    const record = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { user: true } });
    expect(record.user?.username).toBe(record.studentNumber);
    expect(record.user?.mustChangePassword).toBe(true);
    const subjects = mail.sent.filter((message) => message.to === EMAIL).map((message) => message.subject);
    expect(subjects).toContain("Your student portal account is ready");
    expect(subjects.some((subject) => subject.startsWith("You're enrolled"))).toBe(true);
  });

  it("lets staff reject an application with a reason", async () => {
    const second = await request(app).post("/api/applications").send({ ...form, firstName: "Carlo", email: "carlo.applicant@example.com" });
    expect(second.status).toBe(201);
    const list = await staff.get("/api/applications?search=carlo.applicant");
    const id = list.body.data[0].id;

    expect((await staff.post(`/api/applications/${id}/reject`, {})).status).toBe(422);
    const rejected = await staff.post(`/api/applications/${id}/reject`, { remarks: "Incomplete documents; applicant will reapply next term." });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data).toMatchObject({ status: "REJECTED", remarks: "Incomplete documents; applicant will reapply next term." });
  });
});
