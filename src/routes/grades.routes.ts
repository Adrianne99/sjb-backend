// /api/grades — grade encoding and publishing (admin + staff).
import { Router } from "express";
import * as grades from "../controllers/grades.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth);

const canRead = requirePermission("grades:read");
const canWrite = requirePermission("grades:write");
const canPublish = requirePermission("grades:publish");

router.get("/", canRead, grades.list);
router.get("/classes", canRead, grades.listClasses);
router.get("/roster", canRead, grades.roster);
router.post("/", canWrite, grades.create);
router.post("/bulk", canWrite, grades.saveClass);
router.post("/publish", canPublish, grades.publishClass);
// Teachers' "Submit for review": classes waiting for staff, and sending one back.
router.get("/submissions/pending", canPublish, grades.pendingSubmissions);
router.post("/return", canPublish, grades.returnClass);
router.put("/:id", canWrite, grades.update);
router.get("/:id/history", canRead, grades.history);
router.post("/:id/publish", canPublish, grades.publish);

export default router;
