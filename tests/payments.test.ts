import { beforeAll, describe, expect, it } from "vitest";
import { CREDENTIALS, findStudentId, loginAs, type TestAgent } from "./helpers";

describe("Payments and balances", () => {
  let staff: TestAgent;
  let angela: TestAgent;
  let studentId: number;
  let enrollmentId: number;

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.cashier);
    angela = await loginAs(CREDENTIALS.angela);
    studentId = await findStudentId(staff, "2025-0001");
    const detail = await staff.get(`/api/students/${studentId}`);
    enrollmentId = detail.body.data.currentEnrollment.id;
  });

  const balance = async () => Number((await staff.get(`/api/students/${studentId}/balance`)).body.data.balance);

  it("calculates Balance = Assessments − RECORDED payments, and voiding restores it", async () => {
    const before = await balance();

    const recorded = await staff.post("/api/payments", {
      enrollmentId,
      amount: 2500,
      paymentDate: "2026-10-01",
      paymentMethod: "CASH",
      referenceNumber: "OR-TEST-0001",
    });
    expect(recorded.status).toBe(201);
    expect(await balance()).toBeCloseTo(before - 2500, 2);

    const voided = await staff.post(`/api/payments/${recorded.body.data.id}/void`, { reason: "Encoded for the wrong student" });
    expect(voided.status).toBe(200);
    expect(voided.body.data.status).toBe("VOIDED");
    expect(await balance()).toBeCloseTo(before, 2);

    const again = await staff.post(`/api/payments/${recorded.body.data.id}/void`, { reason: "again" });
    expect(again.status).toBe(400);
  });

  it("shows the student the same balance the staff sees, and voided payments as voided", async () => {
    const own = await angela.get("/api/me/balance");
    expect(Number(own.body.data.balance)).toBeCloseTo(await balance(), 2);

    const history = await angela.get("/api/me/payment-history");
    const voided = history.body.data.find((payment: { referenceNumber: string }) => payment.referenceNumber === "OR-TEST-0001");
    expect(voided.status).toBe("VOIDED");
    expect(voided).not.toHaveProperty("recordedBy"); // staff details are not exposed
  });

  it("validates amounts", async () => {
    const base = { enrollmentId, paymentDate: "2026-10-01", paymentMethod: "CASH" };
    expect((await staff.post("/api/payments", { ...base, amount: -5 })).status).toBe(422);
    expect((await staff.post("/api/payments", { ...base, amount: 0 })).status).toBe(422);
    expect((await staff.post("/api/payments", { ...base, amount: 10.555 })).status).toBe(422);
  });

  it("rejects a duplicate reference number", async () => {
    const response = await staff.post("/api/payments", {
      enrollmentId,
      amount: 100,
      paymentDate: "2026-10-01",
      paymentMethod: "CASH",
      referenceNumber: "OR-TEST-0001",
    });
    expect(response.status).toBe(409);
  });

  it("has no way to delete a payment", async () => {
    const list = await staff.get("/api/payments?pageSize=1");
    const response = await staff.delete(`/api/payments/${list.body.data[0].id}`);
    expect(response.status).toBe(404);
  });

  it("filters payments by status", async () => {
    const voided = await staff.get("/api/payments?status=VOIDED");
    expect(voided.body.data.length).toBeGreaterThan(0);
    expect(voided.body.data.every((payment: { status: string }) => payment.status === "VOIDED")).toBe(true);
  });
});
