// /api/requirements — admission requirements (Form 137, Diploma, Form 138, Good Moral).
// Each student's checklist lives under /api/students/:id/requirements.
import { Router } from "express";
import * as requirements from "../controllers/requirements.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();

router.get("/public", requirements.listPublic);

router.get("/types", requireAuth, requirePermission("requirements:read"), requirements.listTypes);
router.post("/types", requireAuth, requirePermission("academic:manage"), requirements.createType);
router.put("/types/:id", requireAuth, requirePermission("academic:manage"), requirements.updateType);

router.get("/compliance", requireAuth, requirePermission("requirements:read"), requirements.compliance);

export default router;
