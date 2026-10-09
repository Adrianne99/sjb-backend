// CASHIER (payments only) and REGISTRAR (enrollment only), next to the existing
// ADMIN and STAFF roles. A status other than 403 means "the permission check
// passed" (e.g. 422 = allowed, but the empty test body is not valid).
import { beforeAll, describe, expect, it } from "vitest";
import { CREDENTIALS, findStudentId, loginAs, type TestAgent } from "./helpers";

describe("Cashier and registrar roles", () => {
  let admin: TestAgent;
  let staff: TestAgent;
  let cashier: TestAgent;
  let registrar: TestAgent;
  let studentId: number;
  let enrollmentId: number;

  beforeAll(async () => {
    admin = await loginAs(CREDENTIALS.admin);
    staff = await loginAs(CREDENTIALS.registrar); // maria: all-around STAFF
    cashier = await loginAs(CREDENTIALS.pedro);
    registrar = await loginAs(CREDENTIALS.rosa);
    studentId = await findStudentId(admin, "2025-0001");
    enrollmentId = (await admin.get(`/api/students/${studentId}`)).body.data.currentEnrollment.id;
  });

  it("logs in with the right roles and permissions", () => {
    expect(cashier.user.role).toBe("CASHIER");
    expect(registrar.user.role).toBe("REGISTRAR");
  });

  describe("CASHIER", () => {
    it("can find students, see balances and record payments", async () => {
      expect((await cashier.get("/api/students?search=2025-0001")).status).toBe(200);
      expect((await cashier.get(`/api/students/${studentId}`)).status).toBe(200);
      expect((await cashier.get(`/api/students/${studentId}/balance`)).status).toBe(200);
      expect((await cashier.get(`/api/students/${studentId}/payments`)).status).toBe(200);
      expect((await cashier.get("/api/payments")).status).toBe(200);

      const recorded = await cashier.post("/api/payments", {
        enrollmentId,
        amount: 500,
        paymentDate: "2026-10-01",
        paymentMethod: "CASH",
        referenceNumber: "OR-CASHIER-0001",
      });
      expect(recorded.status).toBe(201);
    });

    it("cannot void or correct payments", async () => {
      const payments = await cashier.get("/api/payments?search=OR-CASHIER-0001");
      const paymentId = payments.body.data[0].id;
      expect((await cashier.post(`/api/payments/${paymentId}/void`, { reason: "Wrong amount" })).status).toBe(403);
      expect((await cashier.put(`/api/payments/${paymentId}`, { notes: "x" })).status).toBe(403);
    });

    it("cannot change students or do enrollment, grades or admin work", async () => {
      expect((await cashier.post("/api/students", {})).status).toBe(403);
      expect((await cashier.put(`/api/students/${studentId}`, {})).status).toBe(403);
      expect((await cashier.post(`/api/students/${studentId}/archive`)).status).toBe(403);
      for (const url of [
        "/api/enrollments",
        "/api/applications",
        "/api/requirements/compliance",
        "/api/grades",
        `/api/students/${studentId}/grades`,
        `/api/students/${studentId}/requirements`,
        "/api/schedules",
        "/api/reports/collections",
        "/api/announcements",
        "/api/users",
        "/api/audit-logs",
        "/api/settings",
      ]) {
        expect((await cashier.get(url)).status, url).toBe(403);
      }
      expect((await cashier.post("/api/enrollments", {})).status).toBe(403);
    });

    it("gets a dashboard with payment information only", async () => {
      const response = await cashier.get("/api/reports/dashboard");
      expect(response.status).toBe(200);
      const data = response.body.data;
      expect(data.stats.outstandingTotal).not.toBeNull();
      expect(data.collectionsByMonth).toHaveLength(6);
      expect(data.recentPayments.length).toBeGreaterThan(0);
      expect(data.stats.currentlyEnrolled).toBeNull();
      expect(data.stats.pendingEnrollment).toBeNull();
      expect(data.recentEnrollments).toEqual([]);
      expect(data.recentGradeUpdates).toEqual([]);
      expect(data.upcomingClasses).toEqual([]);
      expect(data.recentActivity).toEqual([]);
    });
  });

  describe("REGISTRAR", () => {
    it("can manage students, applications, requirements and enrollment", async () => {
      for (const url of [
        "/api/students",
        `/api/students/${studentId}`,
        `/api/students/${studentId}/requirements`,
        "/api/applications",
        "/api/requirements/compliance",
        "/api/enrollments",
        `/api/enrollments/${enrollmentId}`,
        "/api/schedules",
        "/api/academic/programs",
        "/api/fees",
      ]) {
        expect((await registrar.get(url)).status, url).toBe(200);
      }
      // Allowed (the empty bodies fail validation instead of the permission check).
      expect((await registrar.post("/api/students", {})).status).toBe(422);
      expect((await registrar.post("/api/enrollments", {})).status).toBe(422);
    });

    it("cannot see or record payments, grades or reports", async () => {
      for (const url of [
        "/api/payments",
        `/api/students/${studentId}/balance`,
        `/api/students/${studentId}/payments`,
        "/api/grades",
        `/api/students/${studentId}/grades`,
        `/api/enrollments/${enrollmentId}/report-card`,
        "/api/reports/enrollment-summary",
        "/api/announcements",
        "/api/users",
        "/api/settings",
      ]) {
        expect((await registrar.get(url)).status, url).toBe(403);
      }
      expect((await registrar.post("/api/payments", { enrollmentId, amount: 100, paymentDate: "2026-10-01", paymentMethod: "CASH" })).status).toBe(403);
      expect((await registrar.post("/api/schedules", {})).status).toBe(403);
      expect((await registrar.post("/api/academic/programs", {})).status).toBe(403);
    });

    it("gets a dashboard with enrollment information only", async () => {
      const response = await registrar.get("/api/reports/dashboard");
      expect(response.status).toBe(200);
      const data = response.body.data;
      expect(data.stats.totalStudents).toBeGreaterThan(0);
      expect(typeof data.stats.currentlyEnrolled).toBe("number");
      expect(data.recentEnrollments.length).toBeGreaterThan(0);
      expect(data.stats.outstandingTotal).toBeNull();
      expect(data.stats.studentsWithBalance).toBeNull();
      expect(data.collectionsByMonth).toEqual([]);
      expect(data.recentPayments).toEqual([]);
      expect(data.recentGradeUpdates).toEqual([]);
    });
  });

  describe("STAFF and ADMIN keep everything", () => {
    it("still give staff every staff permission", async () => {
      const response = await staff.get("/api/reports/dashboard");
      expect(response.body.data.stats.outstandingTotal).not.toBeNull();
      expect(response.body.data.stats.currentlyEnrolled).not.toBeNull();
      for (const url of ["/api/payments", "/api/enrollments", "/api/grades", "/api/reports/enrollment-summary"]) {
        expect((await staff.get(url)).status, url).toBe(200);
      }
    });

    it("lets an admin create accounts with the new roles and change them", async () => {
      const created = await admin.post("/api/users", {
        username: "new.cashier",
        email: "new.cashier@school.test",
        firstName: "Carla",
        lastName: "Tan",
        role: "CASHIER",
      });
      expect(created.status).toBe(201);
      const userId = created.body.data.user?.id ?? created.body.data.id;

      const changed = await admin.put(`/api/users/${userId}`, { role: "REGISTRAR" });
      expect(changed.status).toBe(200);
      expect(changed.body.data.role).toBe("REGISTRAR");

      const listed = await admin.get("/api/users?role=REGISTRAR");
      expect(listed.body.data.map((user: { username: string }) => user.username)).toEqual(expect.arrayContaining(["rosa", "new.cashier"]));
    });

    it("does not let a cashier or registrar manage users", async () => {
      expect((await cashier.post("/api/users", { role: "ADMIN" })).status).toBe(403);
      expect((await registrar.put(`/api/users/${registrar.user.id}`, { role: "ADMIN" })).status).toBe(403);
    });
  });
});
