// Database access for SJB Assistant messages (table: chat_messages).
// Every query is filtered by the session ID that the server resolved from the
// cookie — never by an ID sent from the browser.
import { prisma } from "../config/database";
import type { ChatMessageRole } from "../generated/prisma/client";

/** Saves the visitor's question and the assistant's reply together. */
export function saveChatExchange(sessionId: string, question: string, reply: string) {
  return prisma.chatMessage.createMany({
    data: [
      { sessionId, role: "USER" satisfies ChatMessageRole, content: question },
      { sessionId, role: "ASSISTANT" satisfies ChatMessageRole, content: reply },
    ],
  });
}

/** The newest `limit` messages of one session, returned oldest first. */
export async function listRecentChatMessages(sessionId: string, limit: number) {
  const newestFirst = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { id: "desc" },
    take: limit,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return newestFirst.reverse();
}
