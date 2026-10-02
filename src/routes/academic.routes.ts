// /api/academic/* — reference data used by dropdowns and the Settings screen.
// Reading: admin + staff. Creating/editing: admin only.
import { Router } from "express";
import * as academic from "../controllers/academic.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
const canRead = requirePermission("academic:read");
const canManage = requirePermission("academic:manage");

router.use(requireAuth);

router.get("/current-term", canRead, academic.getCurrentTerm);

router.get("/programs", canRead, academic.listPrograms);
router.post("/programs", canManage, academic.createProgram);
router.put("/programs/:id", canManage, academic.updateProgram);

router.get("/academic-years", canRead, academic.listAcademicYears);
router.post("/academic-years", canManage, academic.createAcademicYear);
router.put("/academic-years/:id", canManage, academic.updateAcademicYear);

router.post("/semesters", canManage, academic.createSemester);
router.put("/semesters/:id", canManage, academic.updateSemester);
router.post("/semesters/:id/set-current", canManage, academic.setCurrentSemester);

router.get("/sections", canRead, academic.listSections);
router.post("/sections", canManage, academic.createSection);
router.put("/sections/:id", canManage, academic.updateSection);

router.get("/subjects", canRead, academic.listSubjects);
router.post("/subjects", canManage, academic.createSubject);
router.put("/subjects/:id", canManage, academic.updateSubject);

router.get("/instructors", canRead, academic.listInstructors);
router.post("/instructors", canManage, academic.createInstructor);
router.put("/instructors/:id", canManage, academic.updateInstructor);

router.get("/rooms", canRead, academic.listRooms);
router.post("/rooms", canManage, academic.createRoom);
router.put("/rooms/:id", canManage, academic.updateRoom);

export default router;
