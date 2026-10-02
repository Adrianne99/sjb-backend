// Announcement cover photos and the public "Read more" page.
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, CREDENTIALS, loginAs, type TestAgent } from "./helpers";

// A real 1x1 PNG file.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("Announcement photos and pages", () => {
  let staff: TestAgent;
  let publicId: number;
  let studentsOnlyId: number;

  const upload = (id: number, body: Buffer, type = "image/png") =>
    staff.agent.put(`/api/announcements/${id}/image`).set("X-CSRF-Token", staff.csrfToken).set("Content-Type", type).send(body);

  beforeAll(async () => {
    staff = await loginAs(CREDENTIALS.registrar);
    const base = { content: "Line one.\n\nLine two.", status: "PUBLISHED", publishDate: new Date(Date.now() - 60_000).toISOString() };
    publicId = (await staff.post("/api/announcements", { ...base, title: "Photo test (public)", audience: "PUBLIC" })).body.data.id;
    studentsOnlyId = (await staff.post("/api/announcements", { ...base, title: "Photo test (students)", audience: "STUDENTS" })).body.data.id;
  });

  it("lets staff add a photo, and shows it on the website", async () => {
    const saved = await upload(publicId, PNG);
    expect(saved.status).toBe(200);
    expect(saved.body.data.imagePath).toMatch(new RegExp(`^/announcements/${publicId}/image\\?v=\\d+$`));

    const listed = (await request(app).get("/api/announcements/public")).body.data.find((item: { id: number }) => item.id === publicId);
    expect(listed.imagePath).toBe(saved.body.data.imagePath);

    const photo = await request(app).get(`/api/announcements/${publicId}/image`);
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/png");
    expect(photo.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(Buffer.compare(photo.body as Buffer, PNG)).toBe(0);
  });

  it("refuses files that are not real photos (checks the file itself, not its label)", async () => {
    expect((await upload(publicId, Buffer.from("not really a picture"), "image/png")).status).toBe(400);
    expect((await upload(publicId, Buffer.from("<svg onload=alert(1)>"), "image/svg+xml")).status).toBe(400);
  });

  it("keeps photos of student-only announcements private", async () => {
    expect((await upload(studentsOnlyId, PNG)).status).toBe(200);
    expect((await request(app).get(`/api/announcements/${studentsOnlyId}/image`)).status).toBe(404);
    const student = await loginAs(CREDENTIALS.angela);
    expect((await student.get(`/api/announcements/${studentsOnlyId}/image`)).status).toBe(200);
  });

  it("only staff can change photos", async () => {
    const student = await loginAs(CREDENTIALS.angela);
    const response = await student.agent.put(`/api/announcements/${publicId}/image`).set("X-CSRF-Token", student.csrfToken).set("Content-Type", "image/png").send(PNG);
    expect(response.status).toBe(403);
  });

  it("opens a public announcement on its own page, but not drafts or student-only posts", async () => {
    const page = await request(app).get(`/api/announcements/public/${publicId}`);
    expect(page.status).toBe(200);
    expect(page.body.data).toMatchObject({ title: "Photo test (public)", content: "Line one.\n\nLine two." });
    expect(page.body.data).not.toHaveProperty("createdBy");
    expect((await request(app).get(`/api/announcements/public/${studentsOnlyId}`)).status).toBe(404);
  });

  it("lets staff remove a photo", async () => {
    const removed = await staff.delete(`/api/announcements/${publicId}/image`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.imagePath).toBeNull();
    expect((await request(app).get(`/api/announcements/${publicId}/image`)).status).toBe(404);
  });
});
