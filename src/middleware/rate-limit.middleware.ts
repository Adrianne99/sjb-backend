// Rate limiting — slows down brute-force and spam.
// Limits are per IP address. (Per-account lockout is handled in auth.service.ts.)
import type { Request, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { SESSION_COOKIE_NAME } from "../config/constants";
import { env } from "../config/env";
import { hashToken } from "../utils/crypto";

function limitReached(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ success: false, message, error_code: "RATE_LIMITED" });
  };
}

interface LimiterOptions {
  windowMinutes: number;
  limit: number;
  message: string;
  /** Count only failed requests (status >= 400). */
  onlyFailures?: boolean;
  /** Count per logged-in session instead of per IP address. */
  perSession?: boolean;
}

/** Logged-in users are counted per session; visitors per IP address. */
function sessionOrIpKey(req: Request): string {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  return typeof token === "string" && token ? `session:${hashToken(token)}` : ipKeyGenerator(req.ip ?? "");
}

function createLimiter(options: LimiterOptions) {
  return rateLimit({
    windowMs: options.windowMinutes * 60 * 1000,
    limit: options.limit,
    skipSuccessfulRequests: options.onlyFailures ?? false,
    ...(options.perSession ? { keyGenerator: sessionOrIpKey } : {}),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: limitReached(options.message),
  });
}

/**
 * General protection for the whole API, in two layers:
 * - per session (or per IP for visitors): a normal user never gets near 600 / 15 min;
 * - per IP: a high ceiling, because a whole school computer lab can share one IP.
 */
export function createApiLimiters() {
  const message = "Too many requests. Please slow down.";
  return [
    createLimiter({ windowMinutes: 15, limit: env.isTest ? 10_000 : 5_000, message }),
    createLimiter({ windowMinutes: 15, limit: env.isTest ? 10_000 : 600, message, perSession: true }),
  ];
}

/**
 * FAILED login attempts per IP. Successful logins are not counted, because a
 * whole computer lab may share one public IP address.
 */
export function createLoginLimiter(limit = env.LOGIN_RATE_LIMIT_MAX) {
  return createLimiter({
    windowMinutes: 15,
    limit,
    onlyFailures: true,
    message: "Too many login attempts from this device. Please wait 15 minutes and try again.",
  });
}

/** Forgot/reset password requests per IP. */
export function createPasswordResetLimiter() {
  return createLimiter({ windowMinutes: 15, limit: env.isTest ? 1000 : 5, message: "Too many password reset requests. Please try again later." });
}

/** Public chatbot messages per IP. */
export function createChatbotLimiter() {
  return createLimiter({ windowMinutes: 1, limit: env.isTest ? 1000 : 20, message: "You are sending messages too quickly. Please wait a moment." });
}

/** Public online applications ("Enroll Now") per IP — stops spam. */
export function createApplicationLimiter() {
  return createLimiter({ windowMinutes: 60, limit: env.isTest ? 1000 : 5, message: "Too many applications from this connection. Please try again later or visit the Registrar's Office." });
}
