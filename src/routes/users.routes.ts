// /api/users — account management (ADMIN only).
import { Router } from "express";
import * as users from "../controllers/users.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth, requirePermission("users:manage"));

router.get("/", users.list);
router.post("/", users.create);
router.get("/:id", users.getById);
router.put("/:id", users.update);
router.post("/:id/reset-password", users.resetPassword);

export default router;
