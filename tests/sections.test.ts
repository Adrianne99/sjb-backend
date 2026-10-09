// Settings → Sections: adding and removing sections (ADMIN only).
// A section can only be removed while nothing uses it.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { CREDENTIALS, loginAs, type TestAgent } from "./helpers";

describe("Sections: add and remove", () => {
  let admin: TestAgent;
  let staff: TestAgent;
  let academicYearId: number;
  let itProgramId: number;

  beforeAll(async () => {
    admin = await loginAs(CREDENTIALS.admin);
    staff = await loginAs(CREDENTIALS.registrar);
    academicYearId = (await admin.get("/api/academic/current-term")).body.data.academicYearId;
    itProgramId = (await admin.get("/api/academic/programs")).body.data.find((program: { code: string }) => program.code === "IT").id;
  });

  const sectionsNamed = async (name: string) =>
    ((await admin.get(`/api/academic/sections?academicYearId=${academicYearId}`)).body.data as Array<{ id: number; name: string }>).filter((section) => section.name === name);

  it("removes a section that nothing uses yet", async () => {
    const created = await admin.post("/api/academic/sections", { name: "IT 1-Z", academicYearId, programId: itProgramId, yearLevel: 1 });
    expect(created.status).toBe(201);

    const removed = await admin.delete(`/api/academic/sections/${created.body.data.id}`);
    expect(removed.status).toBe(200);
    expect(await sectionsNamed("IT 1-Z")).toHaveLength(0);

    const audit = await prisma.auditLog.findFirst({ where: { action: "ACADEMIC_RECORD_DELETED", entityType: "section", entityId: String(created.body.data.id) } });
    expect(audit?.description).toContain("IT 1-Z");
  });

  it("keeps a section that students, schedules or grades still use, and says why", async () => {
    const [inUse] = await sectionsNamed("IT 2-A");
    const response = await admin.delete(`/api/academic/sections/${inUse.id}`);
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/IT 2-A can't be removed because it is still used by .*enrollment record/);
    expect(await sectionsNamed("IT 2-A")).toHaveLength(1);
  });

  it("is admin-only (like the rest of academic setup)", async () => {
    const created = await admin.post("/api/academic/sections", { name: "IT 1-Y", academicYearId, programId: itProgramId, yearLevel: 1 });
    expect((await staff.delete(`/api/academic/sections/${created.body.data.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/academic/sections/${created.body.data.id}`)).status).toBe(200);
    expect((await admin.delete("/api/academic/sections/999999")).status).toBe(404);
  });
});
