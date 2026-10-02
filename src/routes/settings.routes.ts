// /api/settings — system settings (ADMIN), plus a read-only grading scale for any logged-in user.
import { Router } from "express";
import * as admin from "../controllers/admin.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth);

router.get("/grading", admin.getGradingConfig);

const canManage = requirePermission("settings:manage");
router.get("/", canManage, admin.getSettings);
router.put("/grading", canManage, admin.updateGrading);
router.delete("/grading", canManage, admin.removeGradingLevel);
router.put("/student-editable-fields", canManage, admin.updateStudentEditableFields);

export default router;
