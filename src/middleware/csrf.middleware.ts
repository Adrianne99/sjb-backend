// CSRF protection (stops other websites from submitting forms "as" a logged-in user).
//
// Two layers, applied to state-changing requests (POST/PUT/PATCH/DELETE):
// 1. Origin check — if the browser sends an Origin header, it must be one of
//    our allowed frontend origins (CORS_ORIGINS).
// 2. Synchronizer token — when the user is logged in, the request must carry
//    the session's CSRF token in the X-CSRF-Token header. The frontend gets
//    this token from POST /api/auth/login and GET /api/auth/me and keeps it in memory.
import type { NextFunction, Request, Response } from "express";
import { CSRF_HEADER_NAME } from "../config/constants";
import { env } from "../config/env";
import { AppError } from "../utils/app-error";
import { safeEqual } from "../utils/crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (origin && !env.corsOrigins.includes(origin)) {
    return next(new AppError(403, "CSRF_INVALID", "This request did not come from an allowed website."));
  }

  if (req.auth) {
    const headerToken = req.get(CSRF_HEADER_NAME) ?? "";
    if (!headerToken || !safeEqual(headerToken, req.auth.csrfToken)) {
      return next(new AppError(403, "CSRF_INVALID", "Your session security token is missing or invalid. Please refresh the page."));
    }
  }

  next();
}
