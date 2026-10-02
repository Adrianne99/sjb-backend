import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireSession } from "../middleware/auth.middleware";
import { createLoginLimiter, createPasswordResetLimiter } from "../middleware/rate-limit.middleware";

export function createAuthRoutes(options: { loginRateLimit?: number } = {}) {
  const router = Router();
  const loginLimiter = createLoginLimiter(options.loginRateLimit);
  const resetLimiter = createPasswordResetLimiter();

  router.post("/login", loginLimiter, authController.login);
  router.post("/forgot-password", resetLimiter, authController.forgotPassword);
  router.post("/reset-password", resetLimiter, authController.resetPassword);
  router.get("/session", authController.session);

  // These work even while a temporary password change is pending.
  router.get("/me", requireSession, authController.me);
  router.post("/logout", requireSession, authController.logout);
  router.post("/change-password", requireSession, authController.changePassword);

  return router;
}
