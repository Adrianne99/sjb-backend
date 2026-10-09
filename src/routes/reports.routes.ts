// /api/reports — the office dashboard (all office roles) and reports (admin + staff).
import { Router } from "express";
import * as admin from "../controllers/admin.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();

// Every office role has a dashboard; it only contains what that role may see.
router.get("/dashboard", requireAuth, requirePermission("dashboard:read"), admin.dashboard);

// The reports themselves.
router.use(requireAuth, requirePermission("reports:read"));
router.get("/enrollment-summary", admin.enrollmentSummary);
router.get("/collections", admin.collections);
router.get("/outstanding-balances", admin.outstandingBalances);

export default router;
