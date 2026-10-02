import crypto from "node:crypto";
import { env } from "../config/env";

/** Random, URL-safe token (used for sessions, CSRF and password resets). */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * One-way hash of a token for storage. We keep only the hash in the database,
 * so a leaked database cannot be used to hijack sessions.
 */
export function hashToken(token: string): string {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");
}

/** Compares two strings in constant time (prevents timing attacks). */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}
