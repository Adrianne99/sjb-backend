import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, CREDENTIALS, findStudentId, loginAs, type TestAgent } from "./helpers";

describe("Admission requirements (Form 137, Diploma, Form 138, Good Moral)", () => {
  let staff: TestAgent;
  let student: TestAgent;
  let juanId: number;
  let form137Id: number;

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.registrar);
    student = await loginAs(CREDENTIALS.angela);
    juanId = await findStudentId(staff, "2026-0001");
    const types = await staff.get("/api/requirements/types");
    form137Id = types.body.data.find((type: { code: string }) => type.code === "FORM_137").id;
  });

  it("publishes the requirement list for the landing page", async () => {
    const response = await request(app).get("/api/requirements/public");
    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { name: string }) => item.name)).toEqual([
      "Form 137 (Permanent Record)",
      "Diploma",
      "Report Card (Form 138)",
      "Certificate of Good Moral Character",
    ]);
  });

  it("shows a student's checklist and lets staff update it (audited)", async () => {
    const before = await staff.get(`/api/students/${juanId}/requirements`);
    expect(before.status).toBe(200);
    expect(before.body.data.items).toHaveLength(4);

    const updated = await staff.put(`/api/students/${juanId}/requirements/${form137Id}`, { status: "VERIFIED", remarks: "Original received" });
    expect(updated.status).toBe(200);
    const form137 = updated.body.data.items.find((item: { requirement: { id: number } }) => item.requirement.id === form137Id);
    expect(form137).toMatchObject({ status: "VERIFIED", remarks: "Original received", updatedBy: "registrar" });
    expect(form137.submittedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // defaults to today

    const admin = await loginAs(CREDENTIALS.admin);
    const logs = await admin.get("/api/audit-logs?action=REQUIREMENT_UPDATED");
    expect(logs.body.data[0].description).toMatch(/Form 137.*Verified/);
  });

  it("does not let students change requirements", async () => {
    const angelaId = await findStudentId(staff, "2025-0001");
    expect((await student.put(`/api/students/${angelaId}/requirements/${form137Id}`, { status: "VERIFIED" })).status).toBe(403);
    expect((await student.get("/api/requirements/compliance")).status).toBe(403);
  });

  it("filters who is complete, incomplete or missing a document", async () => {
    const incomplete = await staff.get("/api/requirements/compliance?completion=incomplete&pageSize=100");
    expect(incomplete.body.data.every((row: { complete: boolean }) => !row.complete)).toBe(true);

    const complete = await staff.get("/api/requirements/compliance?completion=complete&pageSize=100");
    expect(complete.body.data.length).toBeGreaterThan(0);
    expect(complete.body.data.every((row: { complete: boolean; verified: number }) => row.complete && row.verified === 4)).toBe(true);

    const missing = await staff.get(`/api/requirements/compliance?requirementTypeId=${form137Id}&status=PENDING&pageSize=100`);
    expect(missing.body.data.every((row: { statuses: Record<string, string> }) => row.statuses[form137Id] === "PENDING")).toBe(true);
    expect(missing.body.types).toHaveLength(4);
  });
});
