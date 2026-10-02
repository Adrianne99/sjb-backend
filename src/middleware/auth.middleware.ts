// Authentication middleware.
//
//   loadSession     — runs on every request; attaches req.auth if the cookie is valid.
//   requireSession  — must be logged in (even if a password change is pending).
//   requireAuth     — must be logged in AND have replaced any temporary password.
//                     Use this on almost every protected route.
import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE_NAME } from "../config/constants";
import { clearSessionCookie, resolveSession } from "../services/auth/session.service";
import { AppError } from "../utils/app-error";

export async function loadSession(req: Request, res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token !== "string" || token.length === 0) return next();

  const auth = await resolveSession(token);
  if (auth) {
    req.auth = auth;
  } else {
    clearSessionCookie(res); // stale cookie — remove it
  }
  next();
}

export function requireSession(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(AppError.unauthorized());
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(AppError.unauthorized());
  if (req.auth.user.mustChangePassword) {
    return next(
      new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Please change your temporary password before continuing."),
    );
  }
  next();
}
