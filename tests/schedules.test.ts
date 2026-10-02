import { beforeAll, describe, expect, it } from "vitest";
import { CREDENTIALS, loginAs, type TestAgent } from "./helpers";

describe("Schedule conflict detection", () => {
  let staff: TestAgent;
  let base: Record<string, unknown>;
  let baseId: number;
  /** A second section, instructor and room that are NOT used by `base`. */
  let other: { sectionId: number; instructorId: number; roomId: number };
  /** More sections / instructors / a subject for the combined and online class tests. */
  let extra: { sections: number[]; instructors: number[]; subjectId: number };

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.registrar);
    const term = (await staff.get("/api/academic/current-term")).body.data;
    const sections = (await staff.get(`/api/academic/sections?academicYearId=${term.academicYearId}`)).body.data;
    const subjects = (await staff.get("/api/academic/subjects")).body.data;
    const instructors = (await staff.get("/api/academic/instructors")).body.data;
    const rooms = (await staff.get("/api/academic/rooms")).body.data;

    // Sunday has no seeded classes, so these tests start from a clean slate.
    base = {
      semesterId: term.id,
      subjectId: subjects[0].id,
      sectionId: sections[0].id,
      instructorId: instructors[0].id,
      roomId: rooms[0].id,
      dayOfWeek: "SUNDAY",
      startTime: "08:00",
      endTime: "09:30",
    };
    other = { sectionId: sections[1].id, instructorId: instructors[1].id, roomId: rooms[1].id };
    extra = { sections: [sections[2].id, sections[3].id], instructors: [instructors[2].id, instructors[3].id], subjectId: subjects[1].id };
    const created = await staff.post("/api/schedules", base);
    expect(created.status).toBe(201);
    baseId = created.body.data.id;
  });

  it("blocks an instructor from teaching two classes at once", async () => {
    const response = await staff.post("/api/schedules", { ...base, sectionId: other.sectionId, roomId: other.roomId, startTime: "09:00", endTime: "10:00" });
    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("SCHEDULE_CONFLICT");
    expect(response.body.details[0].reasons).toEqual(["instructor"]);
  });

  it("blocks a room from hosting two classes at once", async () => {
    const response = await staff.post("/api/schedules", { ...base, sectionId: other.sectionId, instructorId: other.instructorId });
    expect(response.status).toBe(409);
    expect(response.body.details[0].reasons).toEqual(["room"]);
  });

  it("blocks a section from attending two classes at once", async () => {
    const response = await staff.post("/api/schedules", { ...base, instructorId: other.instructorId, roomId: other.roomId, startTime: "07:00", endTime: "08:30" });
    expect(response.status).toBe(409);
    expect(response.body.details[0].reasons).toEqual(["section"]);
  });

  it("allows back-to-back classes (one ends exactly when the next starts)", async () => {
    const response = await staff.post("/api/schedules", { ...base, startTime: "09:30", endTime: "11:00" });
    expect(response.status).toBe(201);
  });

  it("does not treat a schedule as conflicting with itself when editing", async () => {
    const response = await staff.put(`/api/schedules/${baseId}`, { ...base, endTime: "09:15" });
    expect(response.status).toBe(200);
  });

  it("allows a combined class: two sections with the same subject, teacher, room and time", async () => {
    const slot = { ...base, startTime: "13:00", endTime: "14:30" };
    expect((await staff.post("/api/schedules", slot)).status).toBe(201);
    const together = await staff.post("/api/schedules", { ...slot, sectionId: other.sectionId });
    expect(together.status).toBe(201);

    // Same teacher, room and time but a DIFFERENT subject is still a clash.
    const differentSubject = await staff.post("/api/schedules", { ...slot, sectionId: extra.sections[0], subjectId: extra.subjectId });
    expect(differentSubject.status).toBe(409);
    expect(differentSubject.body.details[0].reasons).toEqual(["instructor", "room"]);

    // Same subject and teacher but a different start time is a clash too.
    const shifted = await staff.post("/api/schedules", { ...slot, sectionId: extra.sections[0], startTime: "13:30", endTime: "15:00" });
    expect(shifted.status).toBe(409);
  });

  it("lets online classes run at the same time (they use no room)", async () => {
    const online = { ...base, mode: "ONLINE", roomId: null, sectionId: extra.sections[0], instructorId: extra.instructors[0], startTime: "16:00", endTime: "17:30" };
    const first = await staff.post("/api/schedules", online);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ mode: "ONLINE", room: null });

    const second = await staff.post("/api/schedules", { ...online, sectionId: extra.sections[1], instructorId: extra.instructors[1], subjectId: extra.subjectId });
    expect(second.status).toBe(201);
  });

  it("requires a room for face-to-face classes", async () => {
    const response = await staff.post("/api/schedules", { ...base, roomId: null, startTime: "18:00", endTime: "19:00" });
    expect(response.status).toBe(422);
    expect(response.body.errors.roomId).toBeTruthy();
  });

  it("rejects an end time before the start time", async () => {
    const response = await staff.post("/api/schedules", { ...base, startTime: "10:00", endTime: "09:00" });
    expect(response.status).toBe(422);
    expect(response.body.errors.endTime).toBeTruthy();
  });
});
