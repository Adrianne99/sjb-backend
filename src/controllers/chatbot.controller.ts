import type { Request, Response } from "express";
import { z } from "zod";
import { handleMessage } from "../services/chatbot/chatbot.service";
import { sendSuccess } from "../utils/response";
import { parseInput } from "../utils/validate";

const messageSchema = z.object({
  message: z.string().trim().min(1, "Type a question first.").max(500, "Please keep your question under 500 characters."),
  /** The last few messages of this chat, so follow-up questions make sense. Optional. */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1500) }))
    .max(6)
    .default([]),
});

export async function message(req: Request, res: Response) {
  const { message: text, history } = parseInput(messageSchema, req.body);
  sendSuccess(res, await handleMessage(text, history));
}
