import type { Request, Response } from "express";
import * as announcementService from "../services/announcements/announcement.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import { announcementSchema, listAnnouncementsQuerySchema } from "../validators/announcement.validators";

/** Public — used by the landing page. */
export async function listPublic(_req: Request, res: Response) {
  sendSuccess(res, await announcementService.listPublicAnnouncements(6));
}

/** Public — one announcement for its own page ("Read more"). */
export async function getPublic(req: Request, res: Response) {
  sendSuccess(res, await announcementService.getPublicAnnouncement(parseId(req.params.id)));
}

/** The cover photo. Public photos may be cached by browsers; others are private. */
export async function image(req: Request, res: Response) {
  const photo = await announcementService.getAnnouncementImage(parseId(req.params.id), req.auth?.user ?? null);
  res.set({
    "Content-Type": photo.type,
    "Cache-Control": photo.isPublic ? "public, max-age=86400" : "private, max-age=300",
    // The website (Vercel) and the API (Render) are different sites in production.
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(photo.data);
}

export async function uploadImage(req: Request, res: Response) {
  sendSuccess(res, await announcementService.setAnnouncementImage(parseId(req.params.id), req.body, getActor(req)), { message: "Photo saved." });
}

export async function removeImage(req: Request, res: Response) {
  sendSuccess(res, await announcementService.removeAnnouncementImage(parseId(req.params.id), getActor(req)), { message: "Photo removed." });
}

export async function list(req: Request, res: Response) {
  const result = await announcementService.listAnnouncements(parseInput(listAnnouncementsQuerySchema, req.query));
  sendSuccess(res, result.items, { meta: result.meta });
}

export async function create(req: Request, res: Response) {
  sendCreated(res, await announcementService.createAnnouncement(parseInput(announcementSchema, req.body), getActor(req)), "Announcement saved.");
}

export async function update(req: Request, res: Response) {
  const input = parseInput(announcementSchema, req.body);
  sendSuccess(res, await announcementService.updateAnnouncement(parseId(req.params.id), input, getActor(req)), { message: "Announcement updated." });
}
