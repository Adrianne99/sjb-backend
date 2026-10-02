// Controllers translate HTTP <-> service calls. Keep business rules in services.
import type { Request, Response } from "express";
import { toCurrentUserDto } from "../mappers/user.mapper";
import * as authService from "../services/auth/auth.service";
import { clearSessionCookie, endSession, setSessionCookie } from "../services/auth/session.service";
import { getActor, getAuth, getClientIp, getUserAgent } from "../utils/request";
import { sendSuccess } from "../utils/response";
import { parseInput } from "../utils/validate";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "../validators/auth.validators";

export async function login(req: Request, res: Response) {
  const input = parseInput(loginSchema, req.body);

  // Logging in again replaces any existing session on this browser.
  if (req.auth) await endSession(req.auth.sessionId);

  const result = await authService.login(input, { ipAddress: getClientIp(req), userAgent: getUserAgent(req) });
  setSessionCookie(res, result.token, result.maxAgeMs);
  sendSuccess(res, { user: toCurrentUserDto(result.user), csrfToken: result.csrfToken }, { message: "Logged in." });
}

export async function logout(req: Request, res: Response) {
  const auth = getAuth(req);
  await authService.logout(getActor(req), auth.sessionId);
  clearSessionCookie(res);
  sendSuccess(res, null, { message: "Logged out." });
}

export async function me(req: Request, res: Response) {
  const auth = getAuth(req);
  sendSuccess(res, { user: toCurrentUserDto(auth.user), csrfToken: auth.csrfToken });
}

/** Like /me, but answers 200 with user: null for visitors (used on page load). */
export async function session(req: Request, res: Response) {
  if (!req.auth) return sendSuccess(res, { user: null, csrfToken: null });
  sendSuccess(res, { user: toCurrentUserDto(req.auth.user), csrfToken: req.auth.csrfToken });
}

export async function changePassword(req: Request, res: Response) {
  const auth = getAuth(req);
  const input = parseInput(changePasswordSchema, req.body);
  const user = await authService.changePassword(auth.user, auth.sessionId, input, getActor(req));
  sendSuccess(res, { user: toCurrentUserDto(user) }, { message: "Your password has been changed." });
}

export async function forgotPassword(req: Request, res: Response) {
  const { identifier } = parseInput(forgotPasswordSchema, req.body);
  await authService.requestPasswordReset(identifier, getActor(req));
  // Same answer whether or not the account exists.
  sendSuccess(res, null, {
    message: "If an account with an email address matches, a password reset link has been sent.",
  });
}

export async function resetPassword(req: Request, res: Response) {
  const input = parseInput(resetPasswordSchema, req.body);
  await authService.resetPassword(input, getActor(req));
  sendSuccess(res, null, { message: "Your password has been reset. You can now log in." });
}
