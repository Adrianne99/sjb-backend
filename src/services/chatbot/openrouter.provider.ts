// AI chatbot provider using OpenRouter (https://openrouter.ai).
//
//   question → [rules + public school information + recent chat] → OpenRouter → answer
//
// Runs ONLY on the backend: the API key never reaches the browser.
// If the AI is slow, over its limit or down, chatbot.service.ts falls back to
// the keyword FAQ, so the assistant always answers something useful.
import { AI_RULES, OUT_OF_SCOPE_MARKER, OUT_OF_SCOPE_REPLY } from "./ai-rules";
import { buildSchoolContext } from "./school-context";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  /** Shown to OpenRouter as the app's website and name (optional headers). */
  siteUrl: string;
  siteName: string;
  /** Lets tests replace the network call. */
  fetchImpl?: typeof fetch;
}

export interface AiAnswer {
  reply: string;
  outOfScope: boolean;
}

/** Thrown when the AI cannot answer; the caller then uses the FAQ instead. */
export class AiUnavailableError extends Error {}

const MAX_REPLY_LENGTH = 1500;

/** Removes things the chat bubble can't show nicely (reasoning tags, Markdown). */
export function cleanReply(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_REPLY_LENGTH);
}

export class OpenRouterProvider {
  constructor(private readonly config: AiProviderConfig) {}

  async ask(question: string, history: ChatTurn[] = []): Promise<AiAnswer> {
    const schoolInformation = await buildSchoolContext();
    const messages = [
      { role: "system", content: `${AI_RULES.join("\n")}\n\n${schoolInformation}` },
      ...history.slice(-6),
      { role: "user", content: question },
    ];

    const fetchImpl = this.config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.config.siteUrl,
          "X-Title": this.config.siteName,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: 0.2,
          max_tokens: 1200,
          // Reasoning models: think briefly and don't send the thinking back.
          reasoning: { effort: "low", exclude: true },
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw new AiUnavailableError(`AI request failed: ${(error as Error).name}`);
    }

    if (!response.ok) {
      // Never log the request (it may contain the key) — only the status.
      throw new AiUnavailableError(`AI service responded with HTTP ${response.status}`);
    }

    const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string | null } }> } | null;
    const raw = body?.choices?.[0]?.message?.content ?? "";
    if (raw.includes(OUT_OF_SCOPE_MARKER)) return { reply: OUT_OF_SCOPE_REPLY, outOfScope: true };

    const reply = cleanReply(raw);
    if (!reply) throw new AiUnavailableError("AI returned an empty answer");
    return { reply, outOfScope: false };
  }
}
