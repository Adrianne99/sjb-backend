// Chatbot service.
//
//   message -> privacy guard -> AI (OpenRouter) -> response
//                                 └─ AI off or failing? -> keyword FAQ
//
// The AI is used when AI_API_KEY is set in backend/.env. It only receives the
// rules (ai-rules.ts) and PUBLIC school information (school-context.ts), and
// answers only questions about Saint John Bosco.
// The privacy guard always runs first, so personal-record requests never reach the AI.
import { env } from "../../config/env";
import { listPublicAnnouncements } from "../announcements/announcement.service";
import { listPublicFees } from "../fees/fee.service";
import { listPublicRequirements } from "../requirements/requirement.service";
import { KNOWLEDGE_BASE, SUGGESTED_QUESTIONS, type KnowledgeEntry } from "./knowledge-base";
import { OUT_OF_SCOPE_REPLY } from "./ai-rules";
import { OpenRouterProvider, type ChatTurn } from "./openrouter.provider";
import { isPrivateRecordRequest, PRIVACY_REPLY } from "./privacy-guard";

export interface ChatbotReply {
  reply: string;
  category: "faq" | "privacy" | "greeting" | "fallback" | "ai" | "out_of_scope";
  topic?: string;
  suggestions: string[];
}

export interface ChatbotProvider {
  reply(message: string, history?: ChatTurn[]): Promise<ChatbotReply>;
}

function scoreEntry(entry: KnowledgeEntry, text: string) {
  return entry.keywords.reduce((score, keyword) => (text.includes(keyword) ? score + keyword.split(" ").length : score), 0);
}

const peso = (value: string | number) => `₱${Number(value).toLocaleString("en-PH")}`;

/** Public tuition summary from the fee table (no student data). */
async function describeTuition(intro: string) {
  const { schedules, crossEnrollmentFee } = await listPublicFees();
  const college = schedules.filter((row) => row.annualTuition === null);
  const seniorHigh = schedules.find((row) => row.annualTuition !== null);
  if (!schedules.length) return "Please contact the Accounting Office for the current tuition fees.";

  const parts = [intro];
  if (college.length) {
    const sample = college[0];
    parts.push(
      `College, per term (${peso(sample.ratePerUnit)} per unit, including the ${peso(sample.miscFee)} miscellaneous fee): ` +
        college.map((row) => `${row.yearLevelLabel} ${row.programCode} ${peso(row.total)}`).join("; ") +
        `. Early bird (paid 1 month before the term): less ${peso(sample.earlyBirdDiscount)}. Cash (paid up to the first day of classes): less ${peso(sample.cashDiscount)}.`,
    );
  }
  if (seniorHigh) parts.push(`Senior High School: free tuition with a voucher, or ${peso(seniorHigh.annualTuition!)} for the whole year without a voucher.`);
  parts.push(`Cross enrollment: ${peso(crossEnrollmentFee)} per 3-unit subject, cash basis only. Units may vary per semester — please confirm with the Accounting Office.`);
  return parts.join(" ");
}

class FaqChatbotProvider implements ChatbotProvider {
  async reply(message: string): Promise<ChatbotReply> {
    const text = message.toLowerCase();

    if (/^(hi|hello|hey|good (morning|afternoon|evening)|kumusta|magandang)/.test(text.trim())) {
      return {
        reply: "Hello! I can answer general questions about admissions, payments, schedules, announcements and the Student Portal. What would you like to know?",
        category: "greeting",
        suggestions: SUGGESTED_QUESTIONS,
      };
    }

    const ranked = KNOWLEDGE_BASE.map((entry) => ({ entry, score: scoreEntry(entry, text) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.entry;
    if (!best) {
      return {
        // Same wording as the AI: the assistant only covers Saint John Bosco topics.
        reply: OUT_OF_SCOPE_REPLY,
        category: "fallback",
        suggestions: SUGGESTED_QUESTIONS,
      };
    }

    let reply = best.answer;
    if (best.id === "admission-requirements") {
      const documents = await listPublicRequirements();
      reply = documents.length
        ? `${reply} ${documents.map((document) => document.name).join("; ")}. Contact the Registrar's Office if you have questions about any document.`
        : "Please contact the Registrar's Office for the list of admission requirements.";
    }
    if (best.id === "tuition-fees") reply = await describeTuition(reply);
    if (best.id === "announcements") {
      const latest = await listPublicAnnouncements(3);
      if (latest.length) reply += ` Latest: ${latest.map((item) => `“${item.title}”`).join(", ")}.`;
    }

    return {
      reply,
      category: "faq",
      topic: best.topic,
      suggestions: SUGGESTED_QUESTIONS.filter((question) => !question.toLowerCase().includes(best.keywords[0])).slice(0, 3),
    };
  }
}

/** Uses the AI, and the keyword FAQ whenever the AI cannot answer. */
export class AiChatbotProvider implements ChatbotProvider {
  constructor(
    private readonly ai: OpenRouterProvider,
    private readonly fallback: ChatbotProvider = new FaqChatbotProvider(),
  ) {}

  async reply(message: string, history: ChatTurn[] = []): Promise<ChatbotReply> {
    const suggestions = SUGGESTED_QUESTIONS.filter((question) => question.toLowerCase() !== message.trim().toLowerCase()).slice(0, 3);
    try {
      const answer = await this.ai.ask(message, history);
      return { reply: answer.reply, category: answer.outOfScope ? "out_of_scope" : "ai", suggestions };
    } catch (error) {
      // Only the reason is logged — never the question or the API key.
      console.warn(`[chatbot] AI unavailable, using FAQ: ${(error as Error).message}`);
      return this.fallback.reply(message);
    }
  }
}

function getProvider(): ChatbotProvider {
  if (!env.AI_API_KEY) return new FaqChatbotProvider();
  return new AiChatbotProvider(
    new OpenRouterProvider({
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL,
      baseUrl: env.AI_BASE_URL,
      timeoutMs: env.AI_TIMEOUT_MS,
      siteUrl: env.FRONTEND_URL,
      siteName: "Saint John Bosco SMS",
    }),
  );
}

export async function handleMessage(message: string, history: ChatTurn[] = []): Promise<ChatbotReply> {
  if (isPrivateRecordRequest(message)) {
    return { reply: PRIVACY_REPLY, category: "privacy", suggestions: SUGGESTED_QUESTIONS.slice(0, 3) };
  }
  return getProvider().reply(message, history);
}
