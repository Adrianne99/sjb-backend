// /api/students — student records (admin + staff).
// GET /:id also allows a STUDENT, but the service only returns their OWN record.
import { Router } from "express";
import * as requirements from "../controllers/requirements.controller";
import * as students from "../controllers/students.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth);

const canRead = requirePermission("students:read");
const canWrite = requirePermission("students:write");
const canManageAccounts = requirePermission("student-accounts:manage");

router.get("/", canRead, students.list);
router.post("/", canWrite, students.create);
router.get("/:id", requirePermission("students:read", "portal:self"), students.getById);
router.put("/:id", canWrite, students.update);
router.post("/:id/archive", requirePermission("students:archive"), students.archive);
router.post("/:id/restore", requirePermission("students:archive"), students.restore);

router.get("/:id/grades", requirePermission("grades:read"), students.grades);
router.get("/:id/balance", requirePermission("payments:read"), students.balance);
router.get("/:id/payments", requirePermission("payments:read"), students.payments);

router.get("/:id/requirements", requirePermission("requirements:read"), requirements.studentChecklist);
router.put("/:id/requirements/:requirementId", requirePermission("requirements:write"), requirements.updateStudentRequirement);

router.post("/:id/account", canManageAccounts, students.createAccount);
router.post("/:id/account/reset-password", canManageAccounts, students.resetPassword);
router.put("/:id/account/status", canManageAccounts, students.setAccountStatus);

export default router;
