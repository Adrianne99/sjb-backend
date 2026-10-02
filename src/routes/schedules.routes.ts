// /api/schedules — class schedules with conflict detection (admin + staff).
import { Router } from "express";
import * as schedules from "../controllers/schedules.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("schedules:read"), schedules.list);
router.post("/", requirePermission("schedules:write"), schedules.create);
router.put("/:id", requirePermission("schedules:write"), schedules.update);
router.delete("/:id", requirePermission("schedules:write"), schedules.remove);

export default router;
