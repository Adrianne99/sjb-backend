import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, CREDENTIALS, findStudentId, loginAs, type TestAgent } from "./helpers";

describe("Enrollment, student records and accounts", () => {
  let admin: TestAgent;
  let staff: TestAgent;
  let currentTermId: number;
  let programs: Array<{ id: number; code: string }>;
  let sections: Array<{ id: number; name: string; programId: number; yearLevel: number }>;

  beforeAll(async () => {
    admin = await loginAs(CREDENTIALS.admin);
    staff = await loginAs(CREDENTIALS.registrar);
    const term = (await staff.get("/api/academic/current-term")).body.data;
    currentTermId = term.id;
    programs = (await staff.get("/api/academic/programs")).body.data;
    sections = (await staff.get(`/api/academic/sections?academicYearId=${term.academicYearId}`)).body.data;
  });

  const program = (code: string) => programs.find((item) => item.code === code)!;
  const section = (name: string) => sections.find((item) => item.name === name)!;

  const newStudent = (overrides: Record<string, unknown> = {}) => ({
    firstName: "Test",
    lastName: "Estudyante",
    dateOfBirth: "2008-07-04",
    sex: "FEMALE",
    programId: program("HRS").id,
    profile: { email: null, contactNumber: "0917 000 0000" },
    ...overrides,
  });

  it("prevents a second enrollment for the same student and term", async () => {
    const angelaId = await findStudentId(staff, "2025-0001");
    const response = await staff.post("/api/enrollments", {
      studentId: angelaId,
      semesterId: currentTermId,
      programId: program("IT").id,
      yearLevel: 2,
      enrollmentDate: "2026-10-01",
    });
    expect(response.status).toBe(409);
  });

  it("rolls back the whole student creation if the initial enrollment is invalid", async () => {
    const response = await staff.post(
      "/api/students",
      newStudent({
        lastName: "Rollback",
        // An IT section for an HRS student — invalid.
        initialEnrollment: { semesterId: currentTermId, yearLevel: 1, sectionId: section("IT 1-A").id, status: "ENROLLED" },
      }),
    );
    expect(response.status).toBe(422);
    expect(response.body.errors.sectionId).toBeTruthy();

    const search = await staff.get("/api/students?search=Rollback");
    expect(search.body.data).toHaveLength(0);
  });

  it("creates a student, enrolls them and issues a birthdate (MMDDYYYY) temporary password", async () => {
    const response = await staff.post(
      "/api/students",
      newStudent({
        initialEnrollment: { semesterId: currentTermId, yearLevel: 1, sectionId: section("HRS 1-A").id, status: "ENROLLED" },
        createAccount: true,
      }),
    );
    expect(response.status).toBe(201);
    const { student, credentials } = response.body.data;
    expect(student.studentNumber).toMatch(/^\d{4}-\d{4}$/);
    expect(student.currentEnrollment.sectionName).toBe("HRS 1-A");
    expect(credentials).toMatchObject({ username: student.studentNumber, temporaryPassword: "07042008" });

    const login = await request(app).post("/api/auth/login").send({ identifier: student.studentNumber, password: "07042008" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);

    // A staff reset issues a NEW temporary password; the old one stops working.
    const reset = await staff.post(`/api/students/${student.id}/account/reset-password`);
    expect(reset.status).toBe(200);
    expect(reset.body.data.temporaryPassword).toMatch(/^SJB-/);
    expect((await request(app).post("/api/auth/login").send({ identifier: student.studentNumber, password: "07042008" })).status).toBe(401);
    expect(
      (await request(app).post("/api/auth/login").send({ identifier: student.studentNumber, password: reset.body.data.temporaryPassword }))
        .status,
    ).toBe(200);

    // Creating a second account for the same student is refused.
    expect((await staff.post(`/api/students/${student.id}/account`)).status).toBe(409);
  });

  it("archives a student, which also blocks their portal login", async () => {
    const created = await staff.post("/api/students", newStudent({ lastName: "Archivable", createAccount: true }));
    const { student, credentials } = created.body.data;

    const archived = await staff.post(`/api/students/${student.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe("ARCHIVED");

    const login = await request(app).post("/api/auth/login").send({ identifier: credentials.username, password: credentials.temporaryPassword });
    expect(login.status).toBe(403);

    const enroll = await staff.post("/api/enrollments", {
      studentId: student.id,
      semesterId: currentTermId,
      programId: program("HRS").id,
      yearLevel: 1,
      enrollmentDate: "2026-10-01",
    });
    expect(enroll.status).toBe(400);
  });

  it("returns field-level validation errors", async () => {
    const response = await staff.post("/api/students", { firstName: "", dateOfBirth: "not-a-date" });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ success: false, message: "Validation failed." });
    expect(response.body.errors).toHaveProperty("firstName");
    expect(response.body.errors).toHaveProperty("lastName");
    expect(response.body.errors).toHaveProperty("dateOfBirth");
  });

  it("uses server-side pagination for the student list", async () => {
    const page = await staff.get("/api/students?pageSize=5&page=2");
    expect(page.body.data.length).toBeLessThanOrEqual(5);
    expect(page.body.meta).toMatchObject({ page: 2, pageSize: 5 });
    expect(page.body.meta.total).toBeGreaterThan(5);
  });

  describe("User management", () => {
    it("lets an admin create staff accounts that must change their password", async () => {
      const response = await admin.post("/api/users", {
        username: "new.staff",
        email: "new.staff@school.test",
        firstName: "Nora",
        lastName: "Cabrera",
        role: "STAFF",
      });
      expect(response.status).toBe(201);
      const login = await request(app)
        .post("/api/auth/login")
        .send({ identifier: "new.staff", password: response.body.data.credentials.temporaryPassword });
      expect(login.body.data.user.mustChangePassword).toBe(true);
    });

    it("does not let admins change their own role", async () => {
      const response = await admin.put(`/api/users/${admin.user.id}`, { role: "STAFF" });
      expect(response.status).toBe(400);
    });

    it("signs a user out immediately when their account is deactivated", async () => {
      const created = await admin.post("/api/users", {
        username: "temp.staff",
        email: "temp.staff@school.test",
        firstName: "Temp",
        lastName: "Staff",
        role: "STAFF",
      });
      const tempStaff = await loginAs({ identifier: "temp.staff", password: created.body.data.credentials.temporaryPassword });
      expect((await tempStaff.get("/api/auth/me")).status).toBe(200);

      await admin.put(`/api/users/${created.body.data.user.id}`, { isActive: false });
      expect((await tempStaff.get("/api/auth/me")).status).toBe(401);
    });

    it("records role changes in the audit log", async () => {
      const users = await admin.get("/api/users?search=new.staff");
      const id = users.body.data[0].id;
      expect((await admin.put(`/api/users/${id}`, { role: "ADMIN" })).status).toBe(200);
      const logs = await admin.get("/api/audit-logs?action=ROLE_CHANGED");
      expect(logs.body.data[0].description).toMatch(/new\.staff from STAFF to ADMIN/);
    });
  });
});
