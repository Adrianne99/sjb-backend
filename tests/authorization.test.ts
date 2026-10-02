import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, CREDENTIALS, findStudentId, loginAs, type TestAgent } from "./helpers";

describe("Role-based access control", () => {
  let admin: TestAgent;
  let staff: TestAgent;
  let student: TestAgent;
  let angelaId: number;
  let otherStudentId: number;

  beforeAll(async () => {
    admin = await loginAs(CREDENTIALS.admin);
    staff = await loginAs(CREDENTIALS.registrar);
    student = await loginAs(CREDENTIALS.angela);
    angelaId = await findStudentId(staff, "2025-0001");
    otherStudentId = await findStudentId(staff, "2026-0001");
  });

  const ADMIN_STAFF_ENDPOINTS = [
    "/api/students",
    "/api/enrollments",
    "/api/grades",
    "/api/grades/classes",
    "/api/payments",
    "/api/schedules",
    "/api/reports/dashboard",
    "/api/announcements",
    "/api/academic/programs",
  ];
  const ADMIN_ONLY_ENDPOINTS = ["/api/users", "/api/audit-logs", "/api/settings"];

  it("returns 401 for every protected endpoint when not logged in", async () => {
    for (const url of [...ADMIN_STAFF_ENDPOINTS, ...ADMIN_ONLY_ENDPOINTS, "/api/me/overview", "/api/auth/me"]) {
      const response = await request(app).get(url);
      expect(response.status, url).toBe(401);
    }
  });

  it("blocks students from every administrative endpoint", async () => {
    for (const url of [...ADMIN_STAFF_ENDPOINTS, ...ADMIN_ONLY_ENDPOINTS]) {
      const response = await student.get(url);
      expect(response.status, url).toBe(403);
    }
    expect((await student.post("/api/payments", { enrollmentId: 1, amount: 1 })).status).toBe(403);
    expect((await student.post("/api/grades/publish", { semesterId: 3, sectionId: 1, subjectId: 1 })).status).toBe(403);
    expect((await student.put(`/api/students/${angelaId}`, {})).status).toBe(403);
  });

  it("blocks staff from admin-only endpoints", async () => {
    for (const url of ADMIN_ONLY_ENDPOINTS) {
      expect((await staff.get(url)).status, url).toBe(403);
    }
    expect((await staff.put("/api/settings/grading", {})).status).toBe(403);
    expect((await staff.post("/api/academic/programs", {})).status).toBe(403);
    expect((await staff.put("/api/payments/1", {})).status).toBe(403);
    expect((await staff.post("/api/users", {})).status).toBe(403);
  });

  it("lets admin and staff use staff endpoints", async () => {
    for (const url of ADMIN_STAFF_ENDPOINTS) {
      expect((await staff.get(url)).status, url).toBe(200);
      expect((await admin.get(url)).status, url).toBe(200);
    }
    for (const url of ADMIN_ONLY_ENDPOINTS) {
      expect((await admin.get(url)).status, url).toBe(200);
    }
  });

  it("does not give staff/admin the student portal", async () => {
    expect((await staff.get("/api/me/overview")).status).toBe(403);
    expect((await admin.get("/api/me/grades")).status).toBe(403);
  });

  it("lets a student open only their OWN student record", async () => {
    expect((await student.get(`/api/students/${angelaId}`)).status).toBe(200);
    const other = await student.get(`/api/students/${otherStudentId}`);
    expect(other.status).toBe(403);
    expect(JSON.stringify(other.body)).not.toContain("Dela Cruz");
  });

  it("ignores attempts to request another student's data through /api/me", async () => {
    const balance = await student.get(`/api/me/balance?studentId=${otherStudentId}`);
    const own = await staff.get(`/api/students/${angelaId}/balance`);
    expect(balance.status).toBe(200);
    expect(balance.body.data.balance).toBe(own.body.data.balance);

    const profile = await student.get(`/api/me/profile?studentId=${otherStudentId}`);
    expect(profile.body.data.studentNumber).toBe("2025-0001");
  });

  it("blocks student access to other students' grades and balances via staff routes", async () => {
    expect((await student.get(`/api/students/${otherStudentId}/grades`)).status).toBe(403);
    expect((await student.get(`/api/students/${otherStudentId}/balance`)).status).toBe(403);
    expect((await student.get(`/api/students/${otherStudentId}/payments`)).status).toBe(403);
  });

  it("rejects state-changing requests without the CSRF token", async () => {
    const response = await staff.agent.post("/api/announcements").send({ title: "x" });
    expect(response.status).toBe(403);
    expect(response.body.error_code).toBe("CSRF_INVALID");
  });

  it("rejects requests from a website that is not on the allow-list", async () => {
    const response = await staff.agent
      .post("/api/announcements")
      .set("Origin", "https://evil.example.com")
      .set("X-CSRF-Token", staff.csrfToken)
      .send({});
    expect(response.status).toBe(403);
  });
});
