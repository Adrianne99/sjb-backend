// /api/payments — payment recording. There is no DELETE route on purpose:
// payments are voided, never deleted.
import { Router } from "express";
import * as payments from "../controllers/payments.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("payments:read"), payments.list);
router.post("/", requirePermission("payments:record"), payments.record);
router.get("/:id", requirePermission("payments:read"), payments.getById);
router.put("/:id", requirePermission("payments:edit"), payments.update);
router.post("/:id/void", requirePermission("payments:void"), payments.voidPayment);

export default router;
