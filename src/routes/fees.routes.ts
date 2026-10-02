// /api/fees — the school's tuition fee options.
// GET /public (and /public/tuition-fees.pdf) is open to everyone; staff/admin can read the full list; admins edit it.
import { Router } from "express";
import * as fees from "../controllers/fees.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();

router.get("/public", fees.listPublic);
router.get("/public/tuition-fees.pdf", fees.publicPdf);
router.get("/", requireAuth, requirePermission("payments:read", "enrollments:read"), fees.list);
router.post("/", requireAuth, requirePermission("settings:manage"), fees.create);
router.put("/cross-enrollment-fee", requireAuth, requirePermission("settings:manage"), fees.updateCrossEnrollmentFee);
router.put("/:id", requireAuth, requirePermission("settings:manage"), fees.update);

export default router;
