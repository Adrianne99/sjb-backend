// Thin wrapper around Resend. Controllers never call Resend directly — they
// call the functions in email.service.ts, which use `sendEmail` below.
//
// The API key lives ONLY in backend/.env (RESEND_API_KEY). When it is empty in
// development, emails are printed to the console instead of being sent.
// Sending never throws: a failed email is logged and returns false, so it can
// never break the request that triggered it.
import { Resend } from "resend";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/** Resend accepts at most 100 emails per batch request. */
const BATCH_SIZE = 100;

function logSkipped(messages: EmailMessage[]) {
  if (!env.isProduction && !env.isTest) {
    for (const message of messages) {
      logger.info(`📧 [email not sent — RESEND_API_KEY is empty] To: ${message.to} | ${message.subject}\n${message.text}`);
    }
  } else if (env.isProduction) {
    logger.warn(`RESEND_API_KEY is not configured; ${messages.length} email(s) skipped.`);
  }
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!resend) {
    logSkipped([message]);
    return false;
  }
  try {
    const { error } = await resend.emails.send({ from: env.EMAIL_FROM, ...message });
    if (error) {
      logger.error("Failed to send email via Resend", { subject: message.subject, error: error.message });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("Could not reach Resend", { subject: message.subject, error: (error as Error).message });
    return false;
  }
}

/**
 * Sends many emails (e.g. one announcement to every student) in batches of 100.
 * Each person gets their own email — addresses are never shown to each other.
 * Returns how many were sent.
 */
export async function sendEmailBatch(messages: EmailMessage[]): Promise<number> {
  if (messages.length === 0) return 0;
  if (!resend) {
    logSkipped(messages);
    return 0;
  }
  let sent = 0;
  for (let start = 0; start < messages.length; start += BATCH_SIZE) {
    const chunk = messages.slice(start, start + BATCH_SIZE);
    try {
      const { error } = await resend.batch.send(chunk.map((message) => ({ from: env.EMAIL_FROM, ...message })));
      if (error) logger.error("Failed to send a batch of emails via Resend", { count: chunk.length, error: error.message });
      else sent += chunk.length;
    } catch (error) {
      logger.error("Could not reach Resend for a batch of emails", { count: chunk.length, error: (error as Error).message });
    }
  }
  return sent;
}
