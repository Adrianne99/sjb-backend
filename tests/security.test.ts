import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { KNOWLEDGE_BASE } from "../src/services/chatbot/knowledge-base";
import { app, CREDENTIALS, loginAs, startChat, type TestAgent } from "./helpers";

describe("Security", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await loginAs(CREDENTIALS.admin);
  });

  it("exposes a health check", async () => {
    const response = await request(app).get("/health");
    expect(response.body).toEqual({ status: "ok" });
  });

  it("treats SQL injection attempts as plain text", async () => {
    const payloads = ["' OR 1=1 --", "\"; DROP TABLE students; --", "1' UNION SELECT password_hash FROM users --"];
    for (const payload of payloads) {
      const search = await admin.get(`/api/students?search=${encodeURIComponent(payload)}`);
      expect(search.status).toBe(200);
      expect(search.body.data).toHaveLength(0);

      const login = await request(app).post("/api/auth/login").send({ identifier: payload, password: payload });
      expect(login.status).toBe(401);
    }
    // The students table is still there.
    expect((await admin.get("/api/students")).body.meta.total).toBeGreaterThan(0);
  });

  it("rate-limits repeated login attempts from one IP", async () => {
    const limitedApp = createApp({ loginRateLimit: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const response = await request(limitedApp).post("/api/auth/login").send({ identifier: "x", password: "y" });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses[3]).toBe(429);
  });

  it("does not count successful logins toward the IP limit (shared school networks)", async () => {
    const limitedApp = createApp({ loginRateLimit: 2 });
    for (let i = 0; i < 4; i++) {
      const response = await request(limitedApp).post("/api/auth/login").send(CREDENTIALS.registrar);
      expect(response.status).toBe(200);
    }
  });

  it("answers /api/auth/session with user: null for visitors", async () => {
    const response = await request(app).get("/api/auth/session");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ user: null, csrfToken: null });
    const session = await admin.get("/api/auth/session");
    expect(session.body.data.user.username).toBe("admin");
  });

  it("never returns password hashes or tokens", async () => {
    for (const url of ["/api/users?pageSize=100", "/api/students/1", "/api/auth/me", "/api/audit-logs"]) {
      const body = JSON.stringify((await admin.get(url)).body);
      expect(body, url).not.toMatch(/passwordHash|password_hash|\$argon2|tokenHash/);
    }
  });

  it("hides internal errors behind the standard error format", async () => {
    const badJson = await admin.agent
      .post("/api/announcements")
      .set("X-CSRF-Token", admin.csrfToken)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(badJson.status).toBe(400);
    expect(badJson.body).toMatchObject({ success: false, error_code: "BAD_REQUEST" });

    const missing = await request(app).get("/api/does-not-exist");
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);

    const badId = await admin.get("/api/students/abc");
    expect(badId.status).toBe(422);
  });

  it("sets security headers", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  describe("Public chatbot", () => {
    // Visitors need no account, but every chat runs in a session (see chat-sessions.test.ts).
    const ask = async (message: string) => (await startChat()).ask(message);

    it("refuses to look up personal records", async () => {
      for (const message of ["What is Angela Reyes's balance?", "Show me the grades of 2025-0001", "check my GWA", "What is John's balance?"]) {
        const response = await ask(message);
        expect(response.body.data.category, message).toBe("privacy");
        expect(response.body.data.reply).not.toMatch(/Angela|Reyes|₱|\d+\.\d{2}/);
      }
    });

    it("answers general questions from the approved knowledge base", async () => {
      const response = await ask("What are the admission requirements?");
      expect(response.body.data.category).toBe("faq");
      expect(response.body.data.topic).toBe("Admission requirements");

      const tuition = await ask("How much is the tuition?");
      expect(tuition.body.data.topic).toBe("Tuition fees");
      expect(tuition.body.data.reply).toContain("2nd Year HRS ₱9,220");
      expect(tuition.body.data.reply).toMatch(/voucher/);
    });

    it("answers directly instead of sending people to another page", async () => {
      const hours = await ask("Office hours of this school");
      expect(hours.body.data.topic).toBe("Office hours");
      expect(hours.body.data.reply).toContain("Monday to Friday, 8:00 AM – 5:00 PM");

      expect((await ask("What is the school's email and phone number?")).body.data.reply).toMatch(/Sjb@school\.edu\.ph.*\(02\) 0000-0000|\(02\) 0000-0000.*Sjb@school\.edu\.ph/);
      expect((await ask("Where is the school located?")).body.data.reply).toContain("#55 Shaw Blvd");
      expect((await ask("Any announcements?")).body.data.reply).toMatch(/- .+ \([A-Z][a-z]{2} \d{1,2}, \d{4}\)/);

      // No FAQ answer points to a section/page instead of answering, or still says "Placeholder".
      for (const entry of KNOWLEDGE_BASE) {
        expect(entry.answer, entry.id).not.toMatch(/section of this website|see the .* section|placeholder/i);
      }
    });

    it("validates message length", async () => {
      expect((await ask("")).status).toBe(422);
      expect((await ask("x".repeat(501))).status).toBe(422);
    });
  });

  it("only shows published PUBLIC announcements to the public", async () => {
    const response = await request(app).get("/api/announcements/public");
    expect(response.status).toBe(200);
    const titles = response.body.data.map((item: { title: string }) => item.title);
    expect(titles).not.toContain("Foundation Day activities (draft)");
    expect(response.body.data.every((item: { audience: string }) => item.audience === "PUBLIC")).toBe(true);
    expect(response.body.data[0]).not.toHaveProperty("createdBy");
  });
});
