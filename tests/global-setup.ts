// Runs once before all tests: rebuilds the test database and loads seed data.
import { execSync } from "node:child_process";
import { TEST_ENV } from "../vitest.config";

export default function setup() {
  const env = { ...process.env, ...TEST_ENV };
  console.log("\n🧪 Preparing test database (migrate reset + seed)...");
  execSync("npx prisma migrate reset --force", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
