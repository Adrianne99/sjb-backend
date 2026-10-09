// SJB Assistant chat sessions — no account needed.
//
//   New visitor   -> startChatSession()    random token in an HttpOnly cookie;
//                                           only its HMAC hash goes into chat_sessions
//   Every request -> resolveChatSession()  hash the cookie, look it up, reject it if
//                                           missing / expired / revoked / someone else's
//   Every message -> recordActivity()      moves expires_at forward (idle timeout),
//                                           but never past created_at + maximum lifetime
//
// The browser never sees the token (HttpOnly cookie). It only gets a CSRF token,
// which it sends back in the X-Chat-CSRF-Token header on POST/DELETE requests.
import type { CookieOptions, Request, Response } from "express";
import { CHAT_SESSION_COOKIE_NAME } from "../../config/constants";
import { env } from "../../config/env";
import * as chatSessionRepository from "../../repositories/chat-session.repository";
import type { ChatSessionContext } from "../../types/chat.types";
import { AppError, type ErrorCode } from "../../utils/app-error";
import { generateToken, hashToken } from "../../utils/crypto";
import { logger } from "../../utils/logger";

// --- Settings ----------------------------------------------------------------

/** Timing rules, from backend/.env (see CHAT_SESSION_* in config/env.ts). */
export const chatSessionPolicy = {
  idleMs: env.CHAT_SESSION_IDLE_MINUTES * 60 * 1000,
  maxLifetimeMs: env.CHAT_SESSION_MAX_HOURS * 60 * 60 * 1000,
  retentionMs: env.CHAT_SESSION_RETENTION_HOURS * 60 * 60 * 1000,
};

/**
 * When a session expires: the EARLIER of
 *   - last activity + idle timeout, and
 *   - creation time + maximum lifetime.
 */
export function computeExpiry(createdAt: Date, lastActivityAt: Date, policy = chatSessionPolicy): Date {
  const idleDeadline = lastActivityAt.getTime() + policy.idleMs;
  const lifetimeDeadline = createdAt.getTime() + policy.maxLifetimeMs;
  return new Date(Math.min(idleDeadline, lifetimeDeadline));
}

function isExpired(session: { createdAt: Date; lastActivityAt: Date; expiresAt: Date }, now: Date) {
  // The second check applies the CURRENT settings, in case they were shortened
  // after this session started.
  return session.expiresAt <= now || computeExpiry(session.createdAt, session.lastActivityAt) <= now;
}

// --- Errors ------------------------------------------------------------------

const RESTART_HINT = "Start a new conversation to continue chatting with SJB Assistant.";

const SESSION_ERRORS = {
  CHAT_SESSION_REQUIRED: "Please start a chat session first.",
  CHAT_SESSION_INVALID: `This chat session is not valid. ${RESTART_HINT}`,
  CHAT_SESSION_EXPIRED: `Your chat session has expired. ${RESTART_HINT}`,
  CHAT_SESSION_REVOKED: `This chat session has ended. ${RESTART_HINT}`,
} satisfies Partial<Record<ErrorCode, string>>;

type ChatSessionErrorCode = keyof typeof SESSION_ERRORS;

function sessionError(code: ChatSessionErrorCode) {
  return new AppError(401, code, SESSION_ERRORS[code]);
}

/** True for the 401 errors above (the browser should start a new conversation). */
export function isChatSessionError(error: unknown): error is AppError {
  return error instanceof AppError && error.errorCode in SESSION_ERRORS;
}

// --- Cookie ------------------------------------------------------------------

/**
 * HttpOnly: JavaScript cannot read the token. Secure: HTTPS only in production.
 * Path /api: the login and logout routes also receive it (to link or end the chat).
 */
export function chatCookieOptions(
  settings: { isProduction: boolean; sameSite: "lax" | "strict" | "none" } = {
    isProduction: env.isProduction,
    sameSite: env.COOKIE_SAME_SITE,
  },
): CookieOptions {
  return {
    httpOnly: true,
    secure: settings.isProduction || settings.sameSite === "none",
    sameSite: settings.sameSite,
    path: "/api",
  };
}

function setChatCookie(res: Response, token: string, createdAt: Date) {
  // The browser may keep the cookie until the maximum lifetime; the database decides if it still works.
  const maxAge = Math.max(createdAt.getTime() + chatSessionPolicy.maxLifetimeMs - Date.now(), 0);
  res.cookie(CHAT_SESSION_COOKIE_NAME, token, { ...chatCookieOptions(), maxAge });
}

export function clearChatCookie(res: Response) {
  res.clearCookie(CHAT_SESSION_COOKIE_NAME, chatCookieOptions());
}

/** The raw token from the cookie, or null. Never log this value. */
export function readChatToken(req: Request): string | null {
  const token: unknown = req.cookies?.[CHAT_SESSION_COOKIE_NAME];
  return typeof token === "string" && token.length > 0 ? token : null;
}

/** The CSRF token is derived from the session token, so nothing extra is stored. */
function csrfTokenFor(token: string) {
  return hashToken(`chat-csrf:${token}`);
}

function toContext(
  session: { id: string; userId: number | null; createdAt: Date; lastActivityAt: Date; expiresAt: Date },
  token: string,
): ChatSessionContext {
  return {
    id: session.id,
    userId: session.userId,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    expiresAt: session.expiresAt,
    csrfToken: csrfTokenFor(token),
  };
}

// --- Validation --------------------------------------------------------------

/**
 * Checks the cookie token. Throws a 401 AppError (CHAT_SESSION_*) when the
 * session cannot be used. `viewerUserId` is the logged-in user (from the login
 * cookie, verified by the server), or null for visitors.
 */
export async function resolveChatSession(token: string | null, viewerUserId: number | null, now = new Date()) {
  if (!token) throw sessionError("CHAT_SESSION_REQUIRED");

  const session = await chatSessionRepository.findChatSessionByTokenHash(hashToken(token));
  if (!session) throw sessionError("CHAT_SESSION_INVALID");
  if (session.revokedAt) throw sessionError("CHAT_SESSION_REVOKED");
  if (isExpired(session, now)) throw sessionError("CHAT_SESSION_EXPIRED");

  // A chat linked to an account only works while that account is logged in here.
  if (session.userId !== null && session.userId !== viewerUserId) throw sessionError("CHAT_SESSION_INVALID");

  return toContext(session, token);
}

// --- Actions -----------------------------------------------------------------

/**
 * POST /api/chatbot/sessions. If this browser already has a usable session it
 * is returned as is, so repeated clicks or several tabs do not create duplicates.
 */
export async function startChatSession(token: string | null, viewerUserId: number | null, res: Response) {
  if (token) {
    try {
      return { session: await resolveChatSession(token, viewerUserId), created: false };
    } catch (error) {
      if (!isChatSessionError(error)) throw error;
      // The old session is unusable; fall through and create a new one.
    }
  }

  const newToken = generateToken(32); // 256 random bits from crypto.randomBytes
  const now = new Date();
  const session = await chatSessionRepository.createChatSession({
    sessionTokenHash: hashToken(newToken),
    userId: viewerUserId,
    createdAt: now,
    expiresAt: computeExpiry(now, now),
  });
  setChatCookie(res, newToken, session.createdAt);
  return { session: toContext(session, newToken), created: true };
}

/** Records activity (a message or a refresh). Throws CHAT_SESSION_EXPIRED if it ended meanwhile. */
export async function recordActivity(session: ChatSessionContext, now = new Date()): Promise<ChatSessionContext> {
  const expiresAt = computeExpiry(session.createdAt, now);
  const changed = await chatSessionRepository.recordChatActivity(session.id, now, expiresAt);
  if (changed === 0) throw sessionError("CHAT_SESSION_EXPIRED");
  return { ...session, lastActivityAt: now, expiresAt };
}

/** DELETE /api/chatbot/sessions/current */
export async function endChatSession(session: ChatSessionContext, res: Response) {
  await chatSessionRepository.revokeChatSession(session.id);
  clearChatCookie(res);
}

/**
 * Called after a SUCCESSFUL login. If the visitor was already chatting, the
 * chat is linked to the verified account and gets a new token (the old cookie
 * stops working — protects against session fixation). Never fails the login.
 */
export async function linkChatSessionAfterLogin(req: Request, res: Response, userId: number) {
  const token = readChatToken(req);
  if (!token) return;
  try {
    const session = await resolveChatSession(token, userId);
    const newToken = generateToken(32);
    await chatSessionRepository.linkChatSessionToUser(session.id, userId, hashToken(newToken));
    setChatCookie(res, newToken, session.createdAt);
  } catch (error) {
    // Unusable (or another account's) chat: just drop the cookie. The user can start a new chat.
    clearChatCookie(res);
    if (!isChatSessionError(error)) logger.warn("[chat] Could not link the chat session after login.", (error as Error).message);
  }
}

/** Called on logout: ends this browser's chat so the next person cannot continue it. */
export async function endChatSessionOnLogout(req: Request, res: Response) {
  const token = readChatToken(req);
  if (!token) return;
  clearChatCookie(res);
  const session = await chatSessionRepository.findChatSessionByTokenHash(hashToken(token));
  if (session) await chatSessionRepository.revokeChatSession(session.id);
}

/**
 * Deletes sessions (and their messages) that ended more than
 * CHAT_SESSION_RETENTION_HOURS ago. Active sessions are never touched.
 */
export async function cleanUpChatSessions(now = new Date()) {
  const endedBefore = new Date(now.getTime() - chatSessionPolicy.retentionMs);
  const deleted = await chatSessionRepository.deleteEndedChatSessions(endedBefore);
  if (deleted > 0) logger.info(`[chat] Deleted ${deleted} ended chat session(s).`);
  return deleted;
}
