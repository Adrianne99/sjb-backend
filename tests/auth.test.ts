import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { generateToken, hashToken } from "../src/utils/crypto";
import { app, CREDENTIALS, loginAs, type TestAgent } from "./helpers";

describe("Authentication", () => {
  let admin: TestAgent;

  beforeAll(async () => {
    admin = await loginAs(CREDENTIALS.admin);
  });

  async function createStaffAccount(username: string) {
    const response = await admin.post("/api/users", {
      username,
      email: `${username}@school.test`,
      firstName: "Test",
      lastName: "Staff",
      role: "STAFF",
    });
    expect(response.status).toBe(201);
    return response.body.data.credentials as { username: string; temporaryPassword: string };
  }

  it("logs in with valid credentials and never returns secrets", async () => {
    const response = await request(app).post("/api/auth/login").send(CREDENTIALS.registrar);
    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe("STAFF");
    expect(response.body.data.csrfToken).toBeTruthy();

    const cookie = response.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/sjb_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|\$argon2/);
  });

  it("gives the same generic error for a wrong password and an unknown user", async () => {
    const wrongPassword = await request(app).post("/api/auth/login").send({ identifier: "maria", password: "nope-12345" });
    const unknownUser = await request(app).post("/api/auth/login").send({ identifier: "nobody", password: "nope-12345" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
    expect(wrongPassword.body.error_code).toBe("INVALID_CREDENTIALS");
  });

  it("locks an account after 5 failed attempts", async () => {
    const credentials = await createStaffAccount("lockout.test");
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/login").send({ identifier: credentials.username, password: "wrong-password-1" });
    }
    const response = await request(app)
      .post("/api/auth/login")
      .send({ identifier: credentials.username, password: credentials.temporaryPassword });
    expect(response.status).toBe(423);
    expect(response.body.error_code).toBe("ACCOUNT_LOCKED");
  });

  it("returns the current user from /me and destroys the session on logout", async () => {
    const registrar = await loginAs(CREDENTIALS.registrar);
    const me = await registrar.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBe("maria");
    expect(me.body.data.user.permissions).toContain("grades:write");

    const logout = await registrar.post("/api/auth/logout");
    expect(logout.status).toBe(200);

    const after = await registrar.get("/api/auth/me");
    expect(after.status).toBe(401);
  });

  it("forces a student with a temporary (MMDDYYYY) password to change it first", async () => {
    const juan = await loginAs(CREDENTIALS.juan);
    expect(juan.user.mustChangePassword).toBe(true);

    const blocked = await juan.get("/api/me/overview");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error_code).toBe("PASSWORD_CHANGE_REQUIRED");

    const weak = await juan.post("/api/auth/change-password", {
      currentPassword: "01012008",
      newPassword: "short",
      confirmPassword: "short",
    });
    expect(weak.status).toBe(422);
    expect(weak.body.errors.newPassword).toBeTruthy();

    const mismatch = await juan.post("/api/auth/change-password", {
      currentPassword: "01012008",
      newPassword: "NewPass2026x",
      confirmPassword: "Different2026x",
    });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.errors.confirmPassword).toBeTruthy();

    const changed = await juan.post("/api/auth/change-password", {
      currentPassword: "01012008",
      newPassword: "NewPass2026x",
      confirmPassword: "NewPass2026x",
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.mustChangePassword).toBe(false);

    const overview = await juan.get("/api/me/overview");
    expect(overview.status).toBe(200);

    // The temporary password no longer works.
    const oldLogin = await request(app).post("/api/auth/login").send(CREDENTIALS.juan);
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send({ identifier: "2026-0001", password: "NewPass2026x" });
    expect(newLogin.status).toBe(200);
  });

  it("answers forgot-password the same way whether or not the account exists", async () => {
    const known = await request(app).post("/api/auth/forgot-password").send({ identifier: "maria" });
    const unknown = await request(app).post("/api/auth/forgot-password").send({ identifier: "does-not-exist" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it("resets a password with a valid token, and the token works only once", async () => {
    const credentials = await createStaffAccount("reset.test");
    const user = await prisma.user.findUniqueOrThrow({ where: { username: credentials.username } });
    const token = generateToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 10 * 60000) },
    });

    const body = { token, newPassword: "BrandNew2026x", confirmPassword: "BrandNew2026x" };
    const first = await request(app).post("/api/auth/reset-password").send(body);
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/reset-password").send(body);
    expect(second.status).toBe(400);

    const login = await request(app).post("/api/auth/login").send({ identifier: credentials.username, password: "BrandNew2026x" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(false);
  });

  it("rejects expired reset tokens", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "reset.test" } });
    const token = generateToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1000) },
    });
    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "Another2026x", confirmPassword: "Another2026x" });
    expect(response.status).toBe(400);
  });
});
