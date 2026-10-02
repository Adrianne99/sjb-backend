// Creates, reads and destroys login sessions, and manages the session cookie.
import type { CookieOptions, Response } from "express";
import { env } from "../../config/env";
import { REMEMBER_ME_DURATION_MS, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "../../config/constants";
import type { DbClient } from "../../config/database";
import * as sessionRepository from "../../repositories/session.repository";
import { toAuthUser } from "../../mappers/user.mapper";
import type { AuthContext } from "../../types/auth.types";
import { generateToken, hashToken } from "../../utils/crypto";

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true, // JavaScript in the browser cannot read it (protects against XSS theft)
    secure: env.isProduction || env.COOKIE_SAME_SITE === "none", // HTTPS only in production
    sameSite: env.COOKIE_SAME_SITE,
    path: "/",
  };
}

export async function startSession(
  params: { userId: number; rememberMe: boolean; ipAddress: string | null; userAgent: string | null },
  db?: DbClient,
) {
  const token = generateToken();
  const csrfToken = generateToken();
  const durationMs = params.rememberMe ? REMEMBER_ME_DURATION_MS : SESSION_DURATION_MS;

  await sessionRepository.deleteExpiredSessions(params.userId, db);
  const session = await sessionRepository.createSession(
    {
      tokenHash: hashToken(token),
      csrfToken,
      userId: params.userId,
      expiresAt: new Date(Date.now() + durationMs),
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
    db,
  );

  return { token, csrfToken, session, maxAgeMs: params.rememberMe ? durationMs : undefined };
}

export function setSessionCookie(res: Response, token: string, maxAgeMs?: number) {
  // Without maxAge the cookie disappears when the browser closes ("session cookie").
  res.cookie(SESSION_COOKIE_NAME, token, { ...cookieOptions(), ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
}

// Avoid a database write on every request: refresh "last seen" every 5 minutes.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Looks up the session for a cookie token. Returns null if missing/expired/disabled. */
export async function resolveSession(token: string): Promise<AuthContext | null> {
  const session = await sessionRepository.findSessionByTokenHash(hashToken(token));
  if (!session) return null;

  if (session.expiresAt <= new Date() || !session.user.isActive) {
    await sessionRepository.deleteSessionById(session.id);
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await sessionRepository.touchSession(session.id);
  }

  return { user: toAuthUser(session.user), sessionId: session.id, csrfToken: session.csrfToken };
}

export function endSession(sessionId: number) {
  return sessionRepository.deleteSessionById(sessionId);
}
