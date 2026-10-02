import { beforeAll, describe, expect, it } from "vitest";
import { CREDENTIALS, findStudentId, loginAs, type TestAgent } from "./helpers";

interface Slot {
  subject: { code: string };
  section: { name: string };
}

describe("Irregular students (extra subjects with another section)", () => {
  let staff: TestAgent;
  let angela: TestAgent;
  let angelaEnrollmentId: number;

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.registrar);
    angela = await loginAs(CREDENTIALS.angela);
    const angelaId = await findStudentId(staff, "2025-0001");
    angelaEnrollmentId = (await staff.get(`/api/students/${angelaId}`)).body.data.currentEnrollment.id;
  });

  it("adds the extra subject to the student's own schedule", async () => {
    const schedule = await angela.get("/api/me/schedule");
    const codes = schedule.body.data.slots.map((slot: Slot) => `${slot.subject.code}@${slot.section.name}`);
    expect(codes).toContain("IT102@IT 1-E"); // the retake
    expect(codes).toContain("IT104@IT 2-A"); // her own section
  });

  it("puts the irregular student on the other section's grade sheet", async () => {
    const classes = await staff.get("/api/grades/classes");
    const it102 = classes.body.data.find((row: { subject: { code: string }; section: { name: string } }) => row.subject.code === "IT102" && row.section.name === "IT 1-E");
    expect(it102.irregularCount).toBe(1);

    const roster = await staff.get(`/api/grades/roster?semesterId=${it102.semesterId}&sectionId=${it102.section.id}&subjectId=${it102.subject.id}`);
    const row = roster.body.data.students.find((item: { student: { studentNumber: string } }) => item.student.studentNumber === "2025-0001");
    expect(row).toMatchObject({ irregular: true, homeSectionName: "IT 2-A" });

    const saved = await staff.post("/api/grades", { enrollmentId: row.enrollmentId, subjectId: it102.subject.id, grade: 2 });
    expect(saved.status).toBe(201);
  });

  it("lists classes the student can still add, with clashes flagged", async () => {
    const available = await staff.get(`/api/enrollments/${angelaEnrollmentId}/available-classes`);
    expect(available.status).toBe(200);
    const codes = available.body.data.map((row: { subject: { code: string } }) => row.subject.code);
    expect(codes).not.toContain("IT102"); // already taken
    expect(codes).not.toContain("IT104"); // own section's subject
    expect(codes).not.toContain("OC11"); // Senior High classes are not offered to college students
    expect(codes).toContain("GE103"); // college GE classes of other sections and programs are
  });

  it("rejects an extra subject that overlaps the student's schedule", async () => {
    const available = (await staff.get(`/api/enrollments/${angelaEnrollmentId}/available-classes`)).body.data;
    const clashing = available.find((row: { conflictsWith: string[] }) => row.conflictsWith.length > 0);
    expect(clashing).toBeTruthy();
    const response = await staff.post(`/api/enrollments/${angelaEnrollmentId}/subjects`, { sectionId: clashing.section.id, subjectId: clashing.subject.id });
    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("SCHEDULE_CONFLICT");
  });

  it("adds a non-clashing class and removes it again", async () => {
    const available = (await staff.get(`/api/enrollments/${angelaEnrollmentId}/available-classes`)).body.data;
    const free = available.find((row: { conflictsWith: string[] }) => row.conflictsWith.length === 0);
    expect(free).toBeTruthy();

    const added = await staff.post(`/api/enrollments/${angelaEnrollmentId}/subjects`, { sectionId: free.section.id, subjectId: free.subject.id });
    expect(added.status).toBe(201);
    const extra = added.body.data.find((item: { subject: { id: number } }) => item.subject.id === free.subject.id);

    const again = await staff.post(`/api/enrollments/${angelaEnrollmentId}/subjects`, { sectionId: free.section.id, subjectId: free.subject.id });
    expect(again.status).toBe(409);

    const removed = await staff.delete(`/api/enrollments/${angelaEnrollmentId}/subjects/${extra.id}`);
    expect(removed.status).toBe(200);
  });

  it("refuses to remove an extra subject that already has a grade", async () => {
    const extras = (await staff.get(`/api/enrollments/${angelaEnrollmentId}/subjects`)).body.data;
    const it102 = extras.find((item: { subject: { code: string } }) => item.subject.code === "IT102");
    expect(it102.hasGrade).toBe(true);
    expect((await staff.delete(`/api/enrollments/${angelaEnrollmentId}/subjects/${it102.id}`)).status).toBe(400);
  });
});

describe("Senior High School (Grade 11–12) and program year levels", () => {
  let staff: TestAgent;
  let admin: TestAgent;

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.registrar);
    admin = await loginAs(CREDENTIALS.admin);
  });

  it("offers only Grade 11–12 for SHS and 1st–2nd year for IT and HRS", async () => {
    const programs = (await staff.get("/api/academic/programs")).body.data;
    const levels = Object.fromEntries(programs.map((program: { code: string; yearLevels: number[] }) => [program.code, program.yearLevels]));
    expect(levels).toEqual({ HRS: [1, 2], IT: [1, 2], SHS: [11, 12] });
  });

  it("rejects year levels a program does not have", async () => {
    const programs = (await staff.get("/api/academic/programs")).body.data;
    const it = programs.find((program: { code: string }) => program.code === "IT");
    const term = (await staff.get("/api/academic/current-term")).body.data;

    const thirdYear = await admin.post("/api/academic/sections", { name: "IT 3-A", programId: it.id, yearLevel: 3, academicYearId: term.academicYearId });
    expect(thirdYear.status).toBe(422);
    expect(thirdYear.body.errors.yearLevel).toMatch(/1st Year and 2nd Year/);
  });

  it("uses the 60–100 scale for Senior High grades", async () => {
    const classes = await staff.get("/api/grades/classes");
    const oc11 = classes.body.data.find((row: { subject: { code: string }; section: { name: string } }) => row.subject.code === "OC11" && row.section.name === "Grade 11-A");
    const selector = { semesterId: oc11.semesterId, sectionId: oc11.section.id, subjectId: oc11.subject.id };
    const roster = await staff.get(`/api/grades/roster?semesterId=${selector.semesterId}&sectionId=${selector.sectionId}&subjectId=${selector.subjectId}`);
    expect(roster.body.data.gradingConfig).toMatchObject({ minGrade: 60, maxGrade: 100, passingGrade: 75, higherIsBetter: true });

    const [first, second] = roster.body.data.students;
    const tooLow = await staff.post("/api/grades/bulk", { ...selector, entries: [{ enrollmentId: first.enrollmentId, grade: 1.5 }] });
    expect(tooLow.status).toBe(422);

    const saved = await staff.post("/api/grades/bulk", {
      ...selector,
      entries: [
        { enrollmentId: first.enrollmentId, grade: 88 },
        { enrollmentId: second.enrollmentId, grade: 74 },
      ],
    });
    expect(saved.status).toBe(200);
    const rows = saved.body.data.roster.students;
    expect(rows.find((row: { enrollmentId: number }) => row.enrollmentId === first.enrollmentId).grade).toMatchObject({ gradeDisplay: "88", remark: "PASSED" });
    expect(rows.find((row: { enrollmentId: number }) => row.enrollmentId === second.enrollmentId).grade).toMatchObject({ gradeDisplay: "74", remark: "FAILED" });
  });
});
