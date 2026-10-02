// /api/me — the student portal. STUDENT role only.
import { Router } from "express";
import * as me from "../controllers/me.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth, requirePermission("portal:self"));

router.get("/overview", me.overview);
router.get("/profile", me.profile);
router.put("/profile", me.updateProfile);
router.get("/grades", me.grades);
router.get("/report-card", me.reportCard);
router.get("/schedule", me.schedule);
router.get("/balance", me.balance);
router.get("/payment-history", me.paymentHistory);
router.get("/announcements", me.announcements);
router.get("/notification-preferences", me.preferences);
router.put("/notification-preferences", me.updatePreferences);

export default router;
