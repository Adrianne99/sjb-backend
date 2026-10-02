// /api/audit-logs — read-only (ADMIN only). No update or delete routes exist.
import { Router } from "express";
import * as admin from "../controllers/admin.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.get("/", requireAuth, requirePermission("audit:read"), admin.auditLogs);

export default router;
