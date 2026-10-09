// TEACHER role: a login linked to an instructor. Teachers see only their own
// classes, can save DRAFT grades for them, and cannot publish or see other records.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { CREDENTIALS, loginAs, type TestAgent } from "./helpers";

interface Offering {
  semesterId: number;
  subject: { id: number; code: string };
  section: { id: number; name: string };
  instructor: { fullName: string };
}

const selectorOf = (offering: Offering) => ({ semesterId: offering.semesterId, sectionId: offering.section.id, subjectId: offering.subject.id });

describe("Teacher role", () => {
  let admin: TestAgent;
  let teacher: TestAgent;
  let myClasses: Offering[];
  let otherClass: Offering;

  beforeAll(async () => {
    admin = await loginAs(CREDENTIALS.admin);
    teacher = await loginAs(CREDENTIALS.marco);
    myClasses = (await teacher.get("/api/teaching/classes")).body.data;
    const allClasses: Offering[] = (await admin.get("/api/grades/classes")).body.data;
    otherClass = allClasses.find((offering) => offering.instructor.fullName !== "Marco Dizon")!;
  });

  it("logs in as a teacher", () => {
    expect(teacher.user.role).toBe("TEACHER");
  });

  it("sees only their own classes and schedule", async () => {
    expect(myClasses.length).toBeGreaterThan(0);
    expect(myClasses.every((offering) => offering.instructor.fullName === "Marco Dizon")).toBe(true);

    const schedule = (await teacher.get("/api/teaching/schedule")).body.data;
    expect(schedule.instructor.fullName).toBe("Marco Dizon");
    expect(schedule.slots.length).toBeGreaterThan(0);
    expect(schedule.slots.every((slot: { instructor: { fullName: string } }) => slot.instructor.fullName === "Marco Dizon")).toBe(true);
  });

  it("opens the roster of their own class, but not another teacher's class", async () => {
    const roster = await teacher.get(`/api/teaching/roster?${new URLSearchParams(Object.entries(selectorOf(myClasses[0])).map(([key, value]) => [key, String(value)]))}`);
    expect(roster.status).toBe(200);
    expect(roster.body.data.students.length).toBeGreaterThan(0);

    const other = await teacher.get(`/api/teaching/roster?${new URLSearchParams(Object.entries(selectorOf(otherClass)).map(([key, value]) => [key, String(value)]))}`);
    expect(other.status).toBe(403);
  });

  it("saves grades only as drafts, and only for their own classes", async () => {
    const offering = myClasses.find((item) => item.subject.code.startsWith("IT")) ?? myClasses[0];
    const query = new URLSearchParams(Object.entries(selectorOf(offering)).map(([key, value]) => [key, String(value)]));
    const roster = (await teacher.get(`/api/teaching/roster?${query}`)).body.data;
    const student = roster.students.find((row: { grade: { status: string } | null }) => !row.grade || row.grade.status === "DRAFT");

    const saved = await teacher.post("/api/teaching/grades", { ...selectorOf(offering), entries: [{ enrollmentId: student.enrollmentId, grade: 1.75, remark: null }] });
    expect(saved.status).toBe(200);
    const row = saved.body.data.roster.students.find((item: { enrollmentId: number }) => item.enrollmentId === student.enrollmentId);
    expect(row.grade).toMatchObject({ status: "DRAFT" });

    const notMine = await teacher.post("/api/teaching/grades", { ...selectorOf(otherClass), entries: [{ enrollmentId: student.enrollmentId, grade: 1.75, remark: null }] });
    expect(notMine.status).toBe(403);

    // Publishing stays with staff.
    expect((await teacher.post("/api/grades/publish", selectorOf(offering))).status).toBe(403);
    expect((await teacher.post("/api/grades/bulk", { ...selectorOf(offering), entries: [] })).status).toBe(403);
  });

  it("cannot see other school records", async () => {
    for (const url of ["/api/grades", "/api/grades/classes", "/api/students", "/api/payments", "/api/enrollments", "/api/reports/dashboard", "/api/users", "/api/announcements"]) {
      expect((await teacher.get(url)).status, url).toBe(403);
    }
    expect((await teacher.get("/api/teaching/announcements")).status).toBe(200);
  });

  it("is refused by teacher pages when the account is not a teacher", async () => {
    expect((await admin.get("/api/teaching/classes")).status).toBe(403);
  });

  describe("teacher accounts (admin)", () => {
    const instructorByNumber = (employeeNumber: string) => prisma.instructor.findUniqueOrThrow({ where: { employeeNumber } });

    it("requires an instructor, and links one instructor to one account", async () => {
      const base = { firstName: "Paulo", lastName: "Manalastas", role: "TEACHER" };
      const missing = await admin.post("/api/users", { ...base, username: "paulo.t", email: "paulo.t@school.test" });
      expect(missing.status).toBe(422);
      expect(missing.body.errors).toHaveProperty("instructorId");

      const instructor = await instructorByNumber("FAC-0110");
      const created = await admin.post("/api/users", { ...base, username: "paulo.t", email: "paulo.t@school.test", instructorId: instructor.id });
      expect(created.status).toBe(201);
      expect(created.body.data.user).toMatchObject({ role: "TEACHER", instructorId: instructor.id, instructorName: "Paulo Manalastas" });
      expect((await instructorByNumber("FAC-0110")).userId).toBe(created.body.data.user.id);

      // The same instructor cannot get a second login (Marco's instructor is already linked too).
      const second = await admin.post("/api/users", { ...base, username: "paulo.t2", email: "paulo.t2@school.test", instructorId: instructor.id });
      expect(second.status).toBe(409);
      const marcoInstructor = await instructorByNumber("FAC-0107");
      expect((await admin.post("/api/users", { ...base, username: "paulo.t3", email: "paulo.t3@school.test", instructorId: marcoInstructor.id })).status).toBe(409);

      // Changing the role away from TEACHER unlinks the instructor.
      const changed = await admin.put(`/api/users/${created.body.data.user.id}`, { role: "STAFF" });
      expect(changed.status).toBe(200);
      expect((await instructorByNumber("FAC-0110")).userId).toBeNull();

      // Changing back to TEACHER needs an instructor again.
      expect((await admin.put(`/api/users/${created.body.data.user.id}`, { role: "TEACHER" })).status).toBe(422);
      const back = await admin.put(`/api/users/${created.body.data.user.id}`, { role: "TEACHER", instructorId: instructor.id });
      expect(back.body.data).toMatchObject({ role: "TEACHER", instructorId: instructor.id });
    });

    it("shows which instructors already have a teacher account", async () => {
      const instructors = (await admin.get("/api/academic/instructors")).body.data as Array<{ employeeNumber: string; hasAccount: boolean }>;
      expect(instructors.find((item) => item.employeeNumber === "FAC-0107")?.hasAccount).toBe(true);
      expect(instructors.find((item) => item.employeeNumber === "FAC-0101")?.hasAccount).toBe(false);
    });
  });

  describe("My Account", () => {
    it("shows and updates the teacher's own details and email settings", async () => {
      const account = (await teacher.get("/api/account")).body.data;
      expect(account).toMatchObject({ username: "marco", role: "TEACHER", firstName: "Marco", lastName: "Dizon" });
      expect(account.instructor.employeeNumber).toBe("FAC-0107");

      const saved = await teacher.put("/api/account/profile", { firstName: "Marco", lastName: "Dizon", email: "marco.dizon@school.test", contactNumber: "0917 555 0101" });
      expect(saved.status).toBe(200);
      expect(saved.body.data.contactNumber).toBe("0917 555 0101");

      const taken = await teacher.put("/api/account/profile", { firstName: "Marco", lastName: "Dizon", email: "admin@school.test" });
      expect(taken.status).toBe(409);

      const settings = await teacher.put("/api/account/notifications", { notifyAccountActivity: true, notifyWorkUpdates: false });
      expect(settings.body.data.notifications).toEqual({ notifyAccountActivity: true, notifyWorkUpdates: false });
      await teacher.put("/api/account/notifications", { notifyAccountActivity: true, notifyWorkUpdates: true });
    });

    it("is for office accounts only (students have their own portal settings)", async () => {
      const student = await loginAs(CREDENTIALS.angela);
      expect((await student.get("/api/account")).status).toBe(403);
      expect((await admin.get("/api/account")).status).toBe(200);
    });
  });

  describe("Submit for review", () => {
    let offering: Offering;
    const selector = () => selectorOf(offering);
    const query = () => new URLSearchParams(Object.entries(selector()).map(([key, value]) => [key, String(value)]));

    beforeAll(async () => {
      const fresh: Array<Offering & { studentCount: number; publishedCount: number; draftCount: number }> = (await teacher.get("/api/teaching/classes")).body.data;
      offering = [...fresh].reverse().find((item) => item.studentCount > 0 && item.publishedCount === 0 && item.draftCount === 0)!;
    });

    it("needs a grade for every student first", async () => {
      const response = await teacher.post("/api/teaching/grades/submit", selector());
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/no grade yet/);
    });

    it("locks the sheet once submitted, then staff return it or publish it", async () => {
      const roster = (await teacher.get(`/api/teaching/roster?${query()}`)).body.data;
      const entries = roster.students.map((row: { enrollmentId: number }) => ({ enrollmentId: row.enrollmentId, grade: 2, remark: null }));
      expect((await teacher.post("/api/teaching/grades", { ...selector(), entries })).status).toBe(200);

      const submitted = await teacher.post("/api/teaching/grades/submit", selector());
      expect(submitted.status).toBe(200);
      expect(submitted.body.data.status).toBe("SUBMITTED");

      // Locked for the teacher; visible to staff.
      expect((await teacher.post("/api/teaching/grades", { ...selector(), entries })).status).toBe(409);
      expect((await teacher.post("/api/teaching/grades/submit", selector())).status).toBe(409);
      const pending = (await admin.get("/api/grades/submissions/pending")).body.data;
      expect(pending.some((item: { subject: { id: number }; section: { id: number } }) => item.subject.id === offering.subject.id && item.section.id === offering.section.id)).toBe(true);
      const staffClass = (await admin.get(`/api/grades/classes?semesterId=${offering.semesterId}`)).body.data.find(
        (item: Offering) => item.subject.id === offering.subject.id && item.section.id === offering.section.id,
      );
      expect(staffClass.submission.status).toBe("SUBMITTED");

      // Teachers cannot review their own submission.
      expect((await teacher.post("/api/grades/return", { ...selector(), note: "x" })).status).toBe(403);

      // Staff return it with a note -> the teacher can change and re-submit.
      expect((await admin.post("/api/grades/return", { ...selector(), note: "" })).status).toBe(422);
      const returned = await admin.post("/api/grades/return", { ...selector(), note: "Please check the grade of the first student." });
      expect(returned.body.data).toMatchObject({ status: "RETURNED", note: "Please check the grade of the first student." });
      const teacherView = (await teacher.get(`/api/teaching/roster?${query()}`)).body.data;
      expect(teacherView.submission).toMatchObject({ status: "RETURNED", note: "Please check the grade of the first student." });
      expect((await teacher.post("/api/teaching/grades", { ...selector(), entries: [{ ...entries[0], grade: 1.5 }] })).status).toBe(200);
      expect((await teacher.post("/api/teaching/grades/submit", selector())).body.data.status).toBe("SUBMITTED");

      // Staff publish -> the submission is done.
      expect((await admin.post("/api/grades/publish", selector())).status).toBe(200);
      const done = (await teacher.get(`/api/teaching/roster?${query()}`)).body.data;
      expect(done.submission.status).toBe("PUBLISHED");
      expect(done.students.every((row: { grade: { status: string } }) => row.grade.status === "PUBLISHED")).toBe(true);
    });
  });

  describe("Attendance", () => {
    let date: string;
    const params = (offering: Offering, extra: Record<string, string> = {}) =>
      new URLSearchParams({ ...Object.fromEntries(Object.entries(selectorOf(offering)).map(([key, value]) => [key, String(value)])), ...extra });

    beforeAll(async () => {
      // A date inside the current term and not in the future.
      const years = (await admin.get("/api/academic/academic-years")).body.data as Array<{ semesters: Array<{ id: number; startDate: string | null; endDate: string | null }> }>;
      const term = years.flatMap((year) => year.semesters).find((item) => item.id === myClasses[0].semesterId)!;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
      date = term.endDate && today > term.endDate ? term.endDate : today;
      if (term.startDate && date < term.startDate) date = term.startDate;
    });

    it("marks students for a date and adds them up for the term", async () => {
      const sheet = (await teacher.get(`/api/teaching/attendance?${params(myClasses[0], { date })}`)).body.data;
      expect(sheet.students.length).toBeGreaterThan(0);
      expect(sheet.students[0].status).toBeNull();
      expect(sheet.students[0].student).not.toHaveProperty("programName");

      const [first, second] = sheet.students;
      const entries = [{ enrollmentId: first.enrollmentId, status: "PRESENT" }, ...(second ? [{ enrollmentId: second.enrollmentId, status: "LATE" }] : [])];
      const saved = await teacher.put("/api/teaching/attendance", { ...selectorOf(myClasses[0]), date, entries });
      expect(saved.status).toBe(200);
      expect(saved.body.data.students[0].status).toBe("PRESENT");

      // Changing a mark updates it (no duplicates).
      await teacher.put("/api/teaching/attendance", { ...selectorOf(myClasses[0]), date, entries: [{ enrollmentId: first.enrollmentId, status: "ABSENT" }] });
      const summary = (await teacher.get(`/api/teaching/attendance/summary?${params(myClasses[0])}`)).body.data;
      expect(summary.dates).toContain(date);
      const row = summary.students.find((item: { enrollmentId: number }) => item.enrollmentId === first.enrollmentId);
      expect(row).toMatchObject({ present: 0, absent: 1 });
    });

    it("refuses future dates, students outside the class, and other teachers' classes", async () => {
      const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
      expect((await teacher.get(`/api/teaching/attendance?${params(myClasses[0], { date: future })}`)).status).toBe(422);
      const outsider = await teacher.put("/api/teaching/attendance", { ...selectorOf(myClasses[0]), date, entries: [{ enrollmentId: 999999, status: "PRESENT" }] });
      expect(outsider.status).toBe(422);
      expect((await teacher.get(`/api/teaching/attendance?${params(otherClass, { date })}`)).status).toBe(403);
    });
  });
});
