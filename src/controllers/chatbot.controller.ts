import type { Request, Response } from "express";
import { z } from "zod";
import { CHAT_HISTORY_FOR_AI, CHAT_HISTORY_MAX_RETURNED } from "../config/constants";
import { toChatMessageDto, toChatTurn } from "../mappers/chat.mapper";
import { listRecentChatMessages, saveChatExchange } from "../repositories/chat-message.repository";
import { handleMessage } from "../services/chatbot/chatbot.service";
import { recordActivity } from "../services/chatbot/chat-session.service";
import { getChatSession } from "../utils/request";
import { sendSuccess } from "../utils/response";
import { parseInput } from "../utils/validate";

// Earlier messages are read from the database (this session only), so the
// browser can no longer send a made-up conversation history.
const messageSchema = z.object({
  message: z.string().trim().min(1, "Type a question first.").max(500, "Please keep your question under 500 characters."),
});

/** POST /message — runs behind requireChatSession, so the session is already valid. */
export async function message(req: Request, res: Response) {
  const { message: text } = parseInput(messageSchema, req.body);
  // Counts as activity first: if the session expired a moment ago, stop before calling the AI.
  const session = await recordActivity(getChatSession(req));

  const earlier = await listRecentChatMessages(session.id, CHAT_HISTORY_FOR_AI);
  const reply = await handleMessage(text, earlier.map(toChatTurn));

  await saveChatExchange(session.id, text, reply.reply);
  sendSuccess(res, reply);
}

/** GET /messages — this session's conversation (oldest first). */
export async function history(req: Request, res: Response) {
  const messages = await listRecentChatMessages(getChatSession(req).id, CHAT_HISTORY_MAX_RETURNED);
  sendSuccess(res, messages.map(toChatMessageDto));
}
