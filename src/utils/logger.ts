// Minimal logger. Keeps output consistent and avoids logging in tests.
import { env } from "../config/env";

function write(level: "info" | "warn" | "error", message: string, extra?: unknown) {
  if (env.isTest && level !== "error") return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (level === "error") console.error(line, extra ?? "");
  else if (level === "warn") console.warn(line, extra ?? "");
  else console.log(line, extra ?? "");
}

export const logger = {
  info: (message: string, extra?: unknown) => write("info", message, extra),
  warn: (message: string, extra?: unknown) => write("warn", message, extra),
  error: (message: string, extra?: unknown) => write("error", message, extra),
};
