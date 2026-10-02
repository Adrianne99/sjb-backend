// AI chatbot tests. The network call is replaced by a fake, so these tests
// never contact OpenRouter and need no API key.
import { describe, expect, it, vi } from "vitest";
import { AI_RULES, OUT_OF_SCOPE_MARKER, OUT_OF_SCOPE_REPLY } from "../src/services/chatbot/ai-rules";
import { AiChatbotProvider } from "../src/services/chatbot/chatbot.service";
import { cleanReply, OpenRouterProvider } from "../src/services/chatbot/openrouter.provider";
import { buildSchoolContext } from "../src/services/chatbot/school-context";

const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function makeProvider(fetchImpl: typeof fetch) {
  return new OpenRouterProvider({
    apiKey: "test-key",
    model: "test/model",
    baseUrl: "https://ai.example.test/v1",
    timeoutMs: 5000,
    siteUrl: "http://localhost:5173",
    siteName: "SJB test",
    fetchImpl,
  });
}

describe("AI chatbot", () => {
  it("sends the rules and ONLY public school information", async () => {
    const fetchMock = vi.fn(async () => reply("The early bird rate is ₱8,860."));
    const answer = await makeProvider(fetchMock as unknown as typeof fetch).ask("How much is early bird for IT?", [{ role: "user", content: "Hi" }]);
    expect(answer).toEqual({ reply: "The early bird rate is ₱8,860.", outOfScope: false });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai.example.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("test/model");
    const system = body.messages[0].content as string;
    expect(system).toContain(AI_RULES[1]);
    expect(system).toContain("Information Technology");
    expect(system).toContain("Form 137");
    expect(system).toContain("₱9,220"); // 2nd Year HRS from the fee table
    // No private data: student names / numbers (e.g. 2025-0001) from the seed never appear.
    expect(system).not.toMatch(/Angela|Dela Cruz|\b20\d{2}-0\d{3}\b/);
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "How much is early bird for IT?" });
  });

  it("marks sample facts as not yet confirmed", async () => {
    const context = await buildSchoolContext();
    expect(context).toMatch(/Office hours \[NOT YET CONFIRMED\]/);
    expect(context).not.toContain("SAMPLE:");
  });

  it("refuses questions that are not about the school", async () => {
    const provider = new AiChatbotProvider(makeProvider((async () => reply(OUT_OF_SCOPE_MARKER)) as unknown as typeof fetch));
    const result = await provider.reply("What is the meaning of life?");
    expect(result).toMatchObject({ category: "out_of_scope", reply: OUT_OF_SCOPE_REPLY });
  });

  it("falls back to the FAQ when the AI fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = new AiChatbotProvider(makeProvider((async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch));
    const result = await provider.reply("What are the admission requirements?");
    expect(result).toMatchObject({ category: "faq", topic: "Admission requirements" });
  });

  it("cleans Markdown and reasoning from answers", () => {
    expect(cleanReply("<think>hmm</think>## Fees\n**Total:** ₱9,860")).toBe("Fees\nTotal: ₱9,860");
  });
});
