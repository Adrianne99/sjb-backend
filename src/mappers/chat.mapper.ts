// Converts chat rows into safe API objects.
// IMPORTANT: never return the session token or session_token_hash.
import type { ChatMessageRole } from "../generated/prisma/client";
import type { ChatTurn } from "../services/chatbot/openrouter.provider";
import type { ChatSessionContext } from "../types/chat.types";

/** What the session endpoints return. */
export function toChatSessionDto(session: ChatSessionContext) {
  return {
    sessionId: session.id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    authenticated: session.userId !== null,
    csrfToken: session.csrfToken,
  };
}

const ROLE_NAMES: Record<ChatMessageRole, ChatTurn["role"]> = { USER: "user", ASSISTANT: "assistant" };

/** One message for GET /api/chatbot/messages. */
export function toChatMessageDto(message: { id: number; role: ChatMessageRole; content: string; createdAt: Date }) {
  return { id: message.id, role: ROLE_NAMES[message.role], content: message.content, createdAt: message.createdAt };
}

/** One earlier message, in the shape the AI provider expects. */
export function toChatTurn(message: { role: ChatMessageRole; content: string }): ChatTurn {
  return { role: ROLE_NAMES[message.role], content: message.content.slice(0, 1500) };
}
