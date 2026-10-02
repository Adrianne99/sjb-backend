// Account emails (password reset, new portal account, password changed).
// Each function builds one message with the shared Saint John Bosco layout
// (templates/layout.ts) and hands it to `sendEmail`.
// Student notifications (enrollment, payments, grades, announcements) are in
// services/notifications/student-notifications.service.ts.
import { env } from "../../config/env";
import { sendEmail } from "./resend.service";
import { renderEmail } from "./templates/layout";

export function sendPasswordResetEmail(params: { to: string; name: string; token: string; expiresInMinutes: number }) {
  const link = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(params.token)}`;
  const email = renderEmail({
    subject: "Reset your school portal password",
    title: "Reset your password",
    preheader: `This link expires in ${params.expiresInMinutes} minutes.`,
    audience: "account",
    blocks: [
      { type: "paragraph", text: `Hello ${params.name},` },
      { type: "paragraph", text: `We received a request to reset your school portal password. This link expires in ${params.expiresInMinutes} minutes.` },
      { type: "button", label: "Reset password", url: link },
      { type: "note", text: "If you did not request this, you can safely ignore this email." },
    ],
  });
  return sendEmail({ to: params.to, ...email });
}

/**
 * Tells a student their portal account is ready. For safety we do NOT put the
 * password itself in the email — only how the temporary password is formed.
 */
export function sendStudentAccountCreatedEmail(params: { to: string; name: string; username: string }) {
  const email = renderEmail({
    subject: "Your student portal account is ready",
    title: "Your student portal account is ready",
    audience: "account",
    blocks: [
      { type: "paragraph", text: `Hello ${params.name},` },
      { type: "paragraph", text: "Your student portal account has been created." },
      {
        type: "details",
        rows: [
          ["Username", params.username],
          ["Temporary password", "Your birthdate in MMDDYYYY format\n(example: January 1, 2001 = 01012001)"],
        ],
      },
      { type: "paragraph", text: "You will be asked to change this password the first time you log in." },
      { type: "button", label: "Go to the portal", url: `${env.FRONTEND_URL}/login` },
    ],
  });
  return sendEmail({ to: params.to, ...email });
}

export function sendPasswordChangedEmail(params: { to: string; name: string }) {
  const email = renderEmail({
    subject: "Your school portal password was changed",
    title: "Your password was changed",
    audience: "account",
    blocks: [
      { type: "paragraph", text: `Hello ${params.name},` },
      { type: "paragraph", text: "Your school portal password was just changed. If this was not you, please contact the Registrar's Office immediately." },
    ],
  });
  return sendEmail({ to: params.to, ...email });
}
