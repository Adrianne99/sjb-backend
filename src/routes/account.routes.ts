// /api/account — My Account for office staff and teachers.
// (Password changes use POST /api/auth/change-password.)
import { Router } from "express";
import * as account from "../controllers/account.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();
router.use(requireAuth, requirePermission("account:self"));

router.get("/", account.get);
router.put("/profile", account.updateProfile);
router.put("/notifications", account.updateNotifications);

export default router;
