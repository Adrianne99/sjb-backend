// The chat session attached to a request by requireChatSession (req.chatSession).

export interface ChatSessionContext {
  id: string;
  /** NULL for anonymous visitors. Always set by the server, never by the browser. */
  userId: number | null;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  /** Must come back in the X-Chat-CSRF-Token header on POST/DELETE requests. */
  csrfToken: string;
}
