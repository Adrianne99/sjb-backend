// /api/announcements — GET /public is open to everyone; the rest is staff-only.
import express, { Router } from "express";
import * as announcements from "../controllers/announcements.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";

const router = Router();

router.get("/public", announcements.listPublic);
router.get("/public/:id", announcements.getPublic);
// Cover photo: public photos for everyone, others need a login (checked in the service).
router.get("/:id/image", announcements.image);

const canManage = [requireAuth, requirePermission("announcements:manage")];
router.get("/", ...canManage, announcements.list);
router.post("/", ...canManage, announcements.create);
router.put("/:id", ...canManage, announcements.update);
// The photo is sent as the raw request body (the browser resizes it first).
router.put("/:id/image", ...canManage, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" }), announcements.uploadImage);
router.delete("/:id/image", ...canManage, announcements.removeImage);

export default router;
