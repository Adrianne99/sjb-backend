// Password hashing (Argon2id) and password rules.
import argon2 from "argon2";
import crypto from "node:crypto";
import { toDateOnlyString } from "./dates";

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    return false;
  }
}

// A valid hash of a random value. Used when a username does not exist so the
// login takes the same amount of time either way (no user enumeration).
let dummyHash: string | null = null;
export async function verifyAgainstDummyHash(plainPassword: string): Promise<void> {
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString("hex"));
  await verifyPassword(dummyHash, plainPassword);
}

/**
 * The school's initial student password: birthdate as MMDDYYYY.
 * January 1, 2001 -> "01012001". It is only ever a TEMPORARY credential —
 * the account is flagged so the student must change it on first login.
 */
export function birthdatePassword(dateOfBirth: Date): string {
  const [year, month, day] = toDateOnlyString(dateOfBirth).split("-");
  return `${month}${day}${year}`;
}

/** Random temporary password for staff-initiated resets, e.g. "SJB-K7QP-4XMZ". */
export function generateTemporaryPassword(): string {
  // No 0/O/1/I/L so it is easy to read aloud or copy by hand.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = () => alphabet[crypto.randomInt(alphabet.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `SJB-${group()}-${group()}`;
}

/** Password strength rules. Returns an error message, or null if OK. */
export function checkPasswordStrength(
  password: string,
  context: { username?: string; forbidden?: string[] } = {},
): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  if (context.username && password.toLowerCase().includes(context.username.toLowerCase())) {
    return "Password must not contain your username or student number.";
  }
  if (context.forbidden?.includes(password)) {
    return "Choose a password that is different from your temporary password.";
  }
  return null;
}
