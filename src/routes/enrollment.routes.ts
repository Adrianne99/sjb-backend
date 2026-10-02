// /api/enrollments — enrollment records and their charges (admin + staff).
import { Router } from "express";
import * as enrollments from "../controllers/enrollments.controller";
import * as fees from "../controllers/fees.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("enrollments:read"), enrollments.list);
router.post("/", requirePermission("enrollments:write"), enrollments.create);
router.get("/:id", requirePermission("enrollments:read"), enrollments.getById);
router.put("/:id", requirePermission("enrollments:write"), enrollments.update);
router.get("/:id/report-card", requirePermission("grades:read"), enrollments.reportCard);

router.post("/:id/apply-fees", requirePermission("assessments:write"), fees.applyToEnrollment);
router.post("/:id/assessments", requirePermission("assessments:write"), enrollments.addAssessment);
router.put("/:id/assessments/:assessmentId", requirePermission("assessments:write"), enrollments.updateAssessment);
router.put("/:id/assessments/:assessmentId/units", requirePermission("assessments:write"), enrollments.updateTuitionUnits);

// Irregular students: subjects taken with another section.
router.get("/:id/subjects", requirePermission("enrollments:read"), enrollments.listExtraSubjects);
router.get("/:id/available-classes", requirePermission("enrollments:read"), enrollments.availableClasses);
router.post("/:id/subjects", requirePermission("enrollments:write"), enrollments.addExtraSubject);
router.delete("/:id/subjects/:extraId", requirePermission("enrollments:write"), enrollments.removeExtraSubject);

export default router;
