// Adds our own `req.auth` property to Express's Request type.
import type { AuthContext } from "./auth.types";
import type { ChatSessionContext } from "./chat.types";

declare global {
  namespace Express {
    interface Request {
      /** Present when the request carries a valid session cookie. */
      auth?: AuthContext;
      /** Present on chatbot routes behind requireChatSession. */
      chatSession?: ChatSessionContext;
    }
  }
}

export {};
