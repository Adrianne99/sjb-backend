import type { Request } from "express";
import type { Actor, AuthContext } from "../types/auth.types";
import type { ChatSessionContext } from "../types/chat.types";
import { AppError } from "./app-error";

export function getClientIp(req: Request): string | null {
  return (req.ip ?? "").slice(0, 45) || null;
}

export function getUserAgent(req: Request): string | null {
  return (req.get("user-agent") ?? "").slice(0, 255) || null;
}

/** The current user as an audit "actor". */
export function getActor(req: Request): Actor {
  return {
    userId: req.auth?.user.id ?? null,
    role: req.auth?.user.role ?? null,
    ipAddress: getClientIp(req),
  };
}

/** Returns req.auth or throws 401. Use inside controllers behind requireAuth. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

/** Returns req.chatSession or throws 401. Use inside controllers behind requireChatSession. */
export function getChatSession(req: Request): ChatSessionContext {
  if (!req.chatSession) throw new AppError(401, "CHAT_SESSION_REQUIRED", "Please start a chat session first.");
  return req.chatSession;
}

/** For /api/me/* routes: the logged-in student's ID (never taken from the URL). */
export function getOwnStudentId(req: Request): number {
  const auth = getAuth(req);
  if (!auth.user.studentId) throw AppError.forbidden("This account is not linked to a student record.");
  return auth.user.studentId;
}
