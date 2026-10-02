// /api/chatbot — public FAQ assistant. Rate limited; never touches student data.
import { Router } from "express";
import * as chatbot from "../controllers/chatbot.controller";
import { createChatbotLimiter } from "../middleware/rate-limit.middleware";

const router = Router();
router.post("/message", createChatbotLimiter(), chatbot.message);

export default router;
