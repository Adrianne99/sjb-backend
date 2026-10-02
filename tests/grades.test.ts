import { beforeAll, describe, expect, it } from "vitest";
import { CREDENTIALS, loginAs, type TestAgent } from "./helpers";

interface ClassRow {
  semesterId: number;
  subject: { id: number; code: string };
  section: { id: number; name: string };
}

describe("Grade management and publishing", () => {
  let admin: TestAgent;
  let staff: TestAgent;
  let angela: TestAgent;
  let target: ClassRow;

  beforeAll(async () => {
    admin = await loginAs(CREDENTIALS.admin);
    staff = await loginAs(CREDENTIALS.registrar);
    angela = await loginAs(CREDENTIALS.angela);

    const classes = await staff.get("/api/grades/classes");
    target = classes.body.data.find((row: ClassRow) => row.section.name === "IT 2-A" && row.subject.code === "IT104");
    expect(target).toBeTruthy();
  });

  const selector = () => ({ semesterId: target.semesterId, sectionId: target.section.id, subjectId: target.subject.id });

  async function angelaCurrentSubjects() {
    const history = await angela.get("/api/me/grades");
    const terms = history.body.data.years.flatMap((year: { terms: unknown[] }) => year.terms);
    const current = terms.find((term: { isCurrent: boolean }) => term.isCurrent);
    return current.subjects as Array<{ subjectCode: string; gradeDisplay: string; remark: string }>;
  }

  it("rejects grades outside the configured scale", async () => {
    const roster = await staff.get(`/api/grades/roster?semesterId=${target.semesterId}&sectionId=${target.section.id}&subjectId=${target.subject.id}`);
    const first = roster.body.data.students[0];
    const response = await staff.post("/api/grades/bulk", { ...selector(), entries: [{ enrollmentId: first.enrollmentId, grade: 6 }] });
    expect(response.status).toBe(422);
    expect(response.body.errors["entries.0.grade"]).toMatch(/between/);
  });

  it("keeps DRAFT grades hidden from students until they are published", async () => {
    const roster = await staff.get(`/api/grades/roster?semesterId=${target.semesterId}&sectionId=${target.section.id}&subjectId=${target.subject.id}`);
    const entries = roster.body.data.students.map((row: { enrollmentId: number }) => ({ enrollmentId: row.enrollmentId, grade: 1.75 }));

    const saved = await staff.post("/api/grades/bulk", { ...selector(), entries });
    expect(saved.status).toBe(200);
    expect(saved.body.data.created).toBe(entries.length);

    expect((await angelaCurrentSubjects()).find((subject) => subject.subjectCode === "IT104")).toBeUndefined();

    const published = await staff.post("/api/grades/publish", selector());
    expect(published.status).toBe(200);
    expect(published.body.data.published).toBe(entries.length);

    const visible = (await angelaCurrentSubjects()).find((subject) => subject.subjectCode === "IT104");
    expect(visible).toMatchObject({ gradeDisplay: "1.75", remark: "PASSED" });
  });

  it("computes remarks from the grading configuration", async () => {
    const list = await staff.get(`/api/grades?subjectId=${target.subject.id}&semesterId=${target.semesterId}`);
    expect(list.body.data.every((grade: { remark: string }) => grade.remark === "PASSED")).toBe(true);
  });

  it("lets staff change a published grade only with a reason, and keeps a history", async () => {
    const list = await staff.get(`/api/grades?subjectId=${target.subject.id}&semesterId=${target.semesterId}&status=PUBLISHED`);
    const gradeId = list.body.data[0].id;

    const noReason = await staff.put(`/api/grades/${gradeId}`, { grade: 1.5 });
    expect(noReason.status).toBe(422);
    expect(noReason.body.errors.reason).toBeTruthy();

    const byStaff = await staff.put(`/api/grades/${gradeId}`, { grade: 1.5, reason: "Recomputed after review" });
    expect(byStaff.status).toBe(200);
    expect(byStaff.body.data.gradeDisplay).toBe("1.50");

    expect((await angela.put(`/api/grades/${gradeId}`, { grade: 1.0, reason: "x" })).status).toBe(403);

    const history = await staff.get(`/api/grades/${gradeId}/history`);
    expect(history.body.data[0]).toMatchObject({ reason: "Recomputed after review", user: "registrar" });

    const audit = await admin.get("/api/audit-logs?action=GRADE_UPDATED");
    expect(audit.body.data.some((log: { description: string }) => log.description.includes("Recomputed after review"))).toBe(true);
  });

  it("lets staff complete an INC (incomplete) grade", async () => {
    const juanId = (await staff.get("/api/students?search=2026-0001")).body.data[0].id;
    const incomplete = await staff.get(`/api/grades?studentId=${juanId}&status=PUBLISHED`);
    const inc = incomplete.body.data.find((grade: { remark: string }) => grade.remark === "INCOMPLETE");
    expect(inc).toBeTruthy();

    const completed = await staff.put(`/api/grades/${inc.id}`, { grade: 2.25, reason: "Completed the missing requirements" });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ gradeDisplay: "2.25", remark: "PASSED", status: "PUBLISHED" });

    const history = await staff.get(`/api/grades/${inc.id}/history`);
    expect(history.body.data[0].description).toMatch(/Completed INC/);
  });

  it("refuses grades for a subject that is not scheduled for the section", async () => {
    const roster = await staff.get(`/api/grades/roster?semesterId=${target.semesterId}&sectionId=${target.section.id}&subjectId=${target.subject.id}`);
    const enrollmentId = roster.body.data.students[0].enrollmentId;
    const subjects = await staff.get("/api/academic/subjects");
    const notOffered = subjects.body.data.find((subject: { code: string }) => subject.code === "HM101");
    const response = await staff.post("/api/grades", { enrollmentId, subjectId: notOffered.id, grade: 2 });
    expect(response.status).toBe(422);
  });

  it("accepts INCOMPLETE without a numeric grade", async () => {
    const classes = await staff.get("/api/grades/classes");
    const other: ClassRow = classes.body.data.find((row: ClassRow) => row.section.name === "IT 2-A" && row.subject.code === "IT114");
    const roster = await staff.get(`/api/grades/roster?semesterId=${other.semesterId}&sectionId=${other.section.id}&subjectId=${other.subject.id}`);
    const response = await staff.post("/api/grades", {
      enrollmentId: roster.body.data.students[0].enrollmentId,
      subjectId: other.subject.id,
      remark: "INCOMPLETE",
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ grade: null, remark: "INCOMPLETE", status: "DRAFT" });
  });
});
