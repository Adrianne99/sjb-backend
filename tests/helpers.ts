// Shared test helpers: an app instance and logged-in "agents".
import request from "supertest";
import { createApp } from "../src/app";

export const app = createApp();

export const CREDENTIALS = {
  admin: { identifier: "admin", password: process.env.SEED_ADMIN_PASSWORD! },
  registrar: { identifier: "maria", password: process.env.SEED_DEMO_PASSWORD! },
  cashier: { identifier: "jose", password: process.env.SEED_DEMO_PASSWORD! },
  /** Angela Reyes — password already changed, has published grade history. */
  angela: { identifier: "2025-0001", password: process.env.SEED_DEMO_PASSWORD! },
  /** Juan Dela Cruz — temporary password (birthdate 2008-01-01). */
  juan: { identifier: "2026-0001", password: "01012008" },
};

export interface TestAgent {
  agent: ReturnType<typeof request.agent>;
  csrfToken: string;
  user: { id: number; role: string; studentId: number | null; mustChangePassword: boolean };
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  put: (url: string, body?: object) => request.Test;
  delete: (url: string) => request.Test;
}

/** Logs in and returns helpers that automatically send the cookie + CSRF token. */
export async function loginAs(credentials: { identifier: string; password: string }, targetApp = app): Promise<TestAgent> {
  const agent = request.agent(targetApp);
  const response = await agent.post("/api/auth/login").send(credentials);
  if (response.status !== 200) {
    throw new Error(`Login failed for ${credentials.identifier}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const { csrfToken, user } = response.body.data;
  return {
    agent,
    csrfToken,
    user,
    get: (url) => agent.get(url),
    post: (url, body = {}) => agent.post(url).set("X-CSRF-Token", csrfToken).send(body),
    put: (url, body = {}) => agent.put(url).set("X-CSRF-Token", csrfToken).send(body),
    delete: (url) => agent.delete(url).set("X-CSRF-Token", csrfToken),
  };
}

/** Finds a student by student number using an admin/staff agent. */
export async function findStudentId(staff: TestAgent, studentNumber: string): Promise<number> {
  const response = await staff.get(`/api/students?search=${encodeURIComponent(studentNumber)}&status=ACTIVE`);
  const student = response.body.data.find((row: { studentNumber: string }) => row.studentNumber === studentNumber);
  if (!student) throw new Error(`Student ${studentNumber} not found`);
  return student.id;
}
