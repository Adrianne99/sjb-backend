// Mounts every module under /api.
import { Router } from "express";
import academicRoutes from "./academic.routes";
import accountRoutes from "./account.routes";
import announcementRoutes from "./announcements.routes";
import applicationRoutes from "./applications.routes";
import auditRoutes from "./audit.routes";
import { createAuthRoutes } from "./auth.routes";
import chatbotRoutes from "./chatbot.routes";
import enrollmentRoutes from "./enrollment.routes";
import feeRoutes from "./fees.routes";
import gradeRoutes from "./grades.routes";
import meRoutes from "./me.routes";
import paymentRoutes from "./payments.routes";
import reportRoutes from "./reports.routes";
import requirementRoutes from "./requirements.routes";
import scheduleRoutes from "./schedules.routes";
import settingsRoutes from "./settings.routes";
import studentRoutes from "./students.routes";
import teachingRoutes from "./teaching.routes";
import userRoutes from "./users.routes";

export function createApiRouter(options: { loginRateLimit?: number } = {}) {
  const router = Router();

  router.use("/auth", createAuthRoutes(options));
  router.use("/me", meRoutes);
  router.use("/account", accountRoutes);
  router.use("/students", studentRoutes);
  router.use("/enrollments", enrollmentRoutes);
  router.use("/grades", gradeRoutes);
  router.use("/schedules", scheduleRoutes);
  router.use("/payments", paymentRoutes);
  router.use("/fees", feeRoutes);
  router.use("/announcements", announcementRoutes);
  router.use("/applications", applicationRoutes);
  router.use("/academic", academicRoutes);
  router.use("/requirements", requirementRoutes);
  router.use("/users", userRoutes);
  router.use("/audit-logs", auditRoutes);
  router.use("/settings", settingsRoutes);
  router.use("/reports", reportRoutes);
  router.use("/chatbot", chatbotRoutes);
  router.use("/teaching", teachingRoutes);

  return router;
}
