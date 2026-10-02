// /api/applications — online pre-registration ("Enroll Now").
// The form options and submitting are public (rate-limited); reviewing is for staff.
import { Router } from "express";
import * as applications from "../controllers/applications.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { createApplicationLimiter } from "../middleware/rate-limit.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();

router.get("/form-options", applications.formOptions);
router.post("/", createApplicationLimiter(), applications.submit);

router.get("/", requireAuth, requirePermission("applications:read"), applications.list);
router.get("/:id", requireAuth, requirePermission("applications:read"), applications.get);
router.post("/:id/convert", requireAuth, requirePermission("applications:write"), applications.convert);
router.post("/:id/reject", requireAuth, requirePermission("applications:write"), applications.reject);

export default router;
