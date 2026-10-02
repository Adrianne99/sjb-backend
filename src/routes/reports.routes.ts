// /api/reports — dashboard and reports (admin + staff).
import { Router } from "express";
import * as admin from "../controllers/admin.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth, requirePermission("reports:read"));

router.get("/dashboard", admin.dashboard);
router.get("/enrollment-summary", admin.enrollmentSummary);
router.get("/collections", admin.collections);
router.get("/outstanding-balances", admin.outstandingBalances);

export default router;
