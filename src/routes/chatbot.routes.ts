// /api/chatbot — public SJB Assistant. No account needed, but every chat runs
// in a session (HttpOnly cookie). Rate limited; never touches student data.
import { Router } from "express";
import * as chatSessions from "../controllers/chat-session.controller";
import * as chatbot from "../controllers/chatbot.controller";
import { requireChatSession } from "../middleware/chat-session.middleware";
import { createChatbotLimiters, createChatSessionLimiter } from "../middleware/rate-limit.middleware";

const router = Router();

// Sessions
router.post("/sessions", createChatSessionLimiter(), chatSessions.create);
router.get("/sessions/current", requireChatSession, chatSessions.current);
router.post("/sessions/refresh", requireChatSession, chatSessions.refresh);
router.delete("/sessions/current", requireChatSession, chatSessions.end);

// Conversation (always the session from the cookie — there is no session ID in the URL)
router.get("/messages", requireChatSession, chatbot.history);
router.post("/message", ...createChatbotLimiters(), requireChatSession, chatbot.message);

export default router;
