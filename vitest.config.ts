// Tests run against a SEPARATE database (saint_john_bosco_sms_test) that is
// wiped and re-seeded before every run — your development data is never touched.
import { defineConfig } from "vitest/config";

export const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "mysql://root:@localhost:3306/saint_john_bosco_sms_test",
  SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters-long",
  CORS_ORIGINS: "http://localhost:5173",
  FRONTEND_URL: "http://localhost:5173",
  RESEND_API_KEY: "",
  AI_API_KEY: "", // tests never call the real AI (see chatbot-ai.test.ts for the fake)
  LOGIN_RATE_LIMIT_MAX: "1000",
  SEED_ADMIN_USERNAME: "admin",
  SEED_ADMIN_EMAIL: "admin@school.test",
  SEED_ADMIN_PASSWORD: "Test-Admin-Pass-2026",
  SEED_DEMO_PASSWORD: "Test-Demo-Pass-2026",
};

export default defineConfig({
  test: {
    environment: "node",
    env: TEST_ENV,
    globalSetup: ["./tests/global-setup.ts"],
    // All test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
