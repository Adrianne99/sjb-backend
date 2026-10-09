// /api/teaching — TEACHER role: own schedule, own class rosters, draft grades,
// "Submit for review", and attendance.
import { Router } from "express";
import * as teaching from "../controllers/teaching.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth, requirePermission("teaching:own"));

router.get("/schedule", teaching.schedule);
router.get("/classes", teaching.classes);
router.get("/roster", teaching.roster);
router.post("/grades", teaching.saveGrades);
router.post("/grades/submit", teaching.submitGrades);
router.get("/attendance", teaching.attendanceSheet);
router.put("/attendance", teaching.saveAttendance);
router.get("/attendance/summary", teaching.attendanceSummary);
router.get("/announcements", teaching.announcements);

export default router;
