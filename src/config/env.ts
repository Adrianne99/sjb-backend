// Loads and validates environment variables once, at startup.
// If something required is missing, the server refuses to start with a clear
// message instead of failing later in a confusing way.
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),

  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Saint John Bosco SMS <no-reply@example.com>"),

  // AI chatbot (OpenRouter). Empty key = the chatbot uses the keyword FAQ only.
  AI_API_KEY: z.string().optional().default(""),
  AI_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  AI_MODEL: z.string().min(1).default("nvidia/nemotron-3-ultra-550b-a55b:free"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(20000),

  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("   Copy backend/.env.example to backend/.env and fill in the values.");
  process.exit(1);
}

const raw = parsed.data;

/** "https://site.app/" → "https://site.app" (browsers send the origin without the slash). */
const withoutTrailingSlash = (url: string) => url.trim().replace(/\/+$/, "");

export const env = {
  ...raw,
  FRONTEND_URL: withoutTrailingSlash(raw.FRONTEND_URL),
  isProduction: raw.NODE_ENV === "production",
  isTest: raw.NODE_ENV === "test",
  corsOrigins: raw.CORS_ORIGINS.split(",").map(withoutTrailingSlash).filter(Boolean),
  // Behind Render's proxy we must trust one hop so req.ip is the real client IP.
  trustProxy: raw.TRUST_PROXY ?? (raw.NODE_ENV === "production" ? 1 : 0),
};
