// requireChatSession — put this on every SJB Assistant route that needs a chat.
//
// 1. Reads the HttpOnly chat cookie and checks it in the database
//    (missing / unknown / expired / revoked / another account's -> 401).
// 2. On POST/DELETE, also checks the X-Chat-CSRF-Token header (-> 403).
// 3. Attaches the session as req.chatSession.
// A session ID sent by the browser is never trusted — only the cookie counts.
import type { NextFunction, Request, Response } from "express";
import { CHAT_CSRF_HEADER_NAME } from "../config/constants";
import { clearChatCookie, isChatSessionError, readChatToken, resolveChatSession } from "../services/chatbot/chat-session.service";
import { AppError } from "../utils/app-error";
import { safeEqual } from "../utils/crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function requireChatSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await resolveChatSession(readChatToken(req), req.auth?.user.id ?? null);

    if (!SAFE_METHODS.has(req.method)) {
      const headerToken = req.get(CHAT_CSRF_HEADER_NAME) ?? "";
      if (!headerToken || !safeEqual(headerToken, session.csrfToken)) {
        throw new AppError(403, "CHAT_CSRF_INVALID", "Your chat security token is missing or invalid. Please reopen the chat.");
      }
    }

    req.chatSession = session;
    next();
  } catch (error) {
    // A dead cookie is removed so the browser stops sending it.
    if (isChatSessionError(error) && readChatToken(req)) clearChatCookie(res);
    next(error);
  }
}
