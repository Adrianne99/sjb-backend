// /api/chatbot/sessions — SJB Assistant chat sessions (no account needed).
// The request body is ignored on purpose: the user ID comes only from the
// verified login cookie, never from the browser.
import type { Request, Response } from "express";
import { toChatSessionDto } from "../mappers/chat.mapper";
import { endChatSession, readChatToken, recordActivity, startChatSession } from "../services/chatbot/chat-session.service";
import { getChatSession } from "../utils/request";
import { sendSuccess } from "../utils/response";

/** POST /sessions — 201 with a new session, or 200 with the one this browser already has. */
export async function create(req: Request, res: Response) {
  const { session, created } = await startChatSession(readChatToken(req), req.auth?.user.id ?? null, res);
  sendSuccess(res, toChatSessionDto(session), { status: created ? 201 : 200 });
}

/** GET /sessions/current — safe details only (never the token or its hash). */
export async function current(req: Request, res: Response) {
  sendSuccess(res, toChatSessionDto(getChatSession(req)));
}

/** POST /sessions/refresh — counts as activity; cannot revive an ended session. */
export async function refresh(req: Request, res: Response) {
  const session = await recordActivity(getChatSession(req));
  sendSuccess(res, toChatSessionDto(session));
}

/** DELETE /sessions/current — ends the chat and removes the cookie. */
export async function end(req: Request, res: Response) {
  await endChatSession(getChatSession(req), res);
  sendSuccess(res, null, { message: "Chat session ended." });
}
