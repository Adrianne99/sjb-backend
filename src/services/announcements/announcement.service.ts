// School announcements.
// PUBLIC announcements appear on the landing page and in the student portal;
// STUDENTS announcements appear in the portal only.
// Content is plain text — the frontend never renders it as HTML (prevents XSS).
import { roleHasPermission } from "../../config/permissions";
import * as announcementRepository from "../../repositories/announcement.repository";
import type { Actor, AuthUser } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { buildPaginationMeta, toSkipTake } from "../../utils/pagination";
import type { AnnouncementInput, ListAnnouncementsQuery } from "../../validators/announcement.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { notifyLater, sendDueAnnouncementEmails } from "../notifications/student-notifications.service";

type AnnouncementRow = NonNullable<Awaited<ReturnType<typeof announcementRepository.findAnnouncementById>>>;

function toAnnouncementDto(announcement: AnnouncementRow) {
  return {
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    audience: announcement.audience,
    category: announcement.category,
    status: announcement.status,
    publishDate: announcement.publishDate.toISOString(),
    expirationDate: announcement.expirationDate?.toISOString() ?? null,
    createdBy: announcement.createdBy?.username ?? null,
    updatedAt: announcement.updatedAt.toISOString(),
    /** Path of the cover photo (add it to the API base URL), or null. "?v=" changes when the photo changes. */
    imagePath: announcement.imageUpdatedAt ? `/announcements/${announcement.id}/image?v=${announcement.imageUpdatedAt.getTime()}` : null,
    /** When it was emailed to students (null = not yet). */
    emailedAt: announcement.emailedAt?.toISOString() ?? null,
  };
}

/** Public-safe version (no author). */
function toPublicAnnouncementDto(announcement: AnnouncementRow) {
  const { createdBy: _createdBy, status: _status, emailedAt: _emailedAt, ...rest } = toAnnouncementDto(announcement);
  return rest;
}

export async function listPublicAnnouncements(limit = 6) {
  return (await announcementRepository.findVisibleAnnouncements(["PUBLIC"], limit)).map(toPublicAnnouncementDto);
}

/** True when the announcement is published and live right now. */
function isLive(announcement: { status: string; publishDate: Date; expirationDate: Date | null }, now = new Date()) {
  return announcement.status === "PUBLISHED" && announcement.publishDate <= now && (!announcement.expirationDate || announcement.expirationDate > now);
}

/** One PUBLIC announcement for its own page on the website ("Read more"). */
export async function getPublicAnnouncement(id: number) {
  const announcement = await announcementRepository.findAnnouncementById(id);
  if (!announcement || announcement.audience !== "PUBLIC" || !isLive(announcement)) throw AppError.notFound("Announcement not found.");
  return toPublicAnnouncementDto(announcement);
}

// --- Cover photos ----------------------------------------------------------------------

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Reads the real file type from the first bytes (never trust the browser's label). */
function detectImageType(data: Buffer): string | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length > 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/**
 * The photo itself. Anyone may see photos of live PUBLIC announcements; photos of
 * student-only announcements need a login; staff can see every photo.
 */
export async function getAnnouncementImage(id: number, user: AuthUser | null) {
  const row = await announcementRepository.findAnnouncementImage(id);
  if (!row || !row.imageData || !row.imageType) throw AppError.notFound("Photo not found.");
  // Whoever manages announcements (admin + staff) may also see drafts' photos.
  const manager = user ? roleHasPermission(user.role, "announcements:manage") : false;
  const allowed = manager || (isLive(row) && (row.audience === "PUBLIC" || Boolean(user)));
  if (!allowed) throw AppError.notFound("Photo not found.");
  return { data: Buffer.from(row.imageData), type: row.imageType, isPublic: row.audience === "PUBLIC" && isLive(row) };
}

export async function setAnnouncementImage(id: number, body: unknown, actor: Actor) {
  const existing = await announcementRepository.findAnnouncementById(id);
  if (!existing) throw AppError.notFound("Announcement not found.");
  if (!Buffer.isBuffer(body) || body.length === 0) throw AppError.badRequest("Choose a JPG, PNG or WebP photo.");
  if (body.length > MAX_IMAGE_BYTES) throw AppError.badRequest("The photo is too large (maximum 3 MB).");
  const type = detectImageType(body);
  if (!type) throw AppError.badRequest("Only JPG, PNG or WebP photos are allowed.");

  const updated = await announcementRepository.setAnnouncementImage(id, { data: new Uint8Array(body), type });
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
    entityType: "announcement",
    entityId: id,
    description: `${existing.imageUpdatedAt ? "Replaced" : "Added"} the photo of announcement "${existing.title}"`,
  });
  return toAnnouncementDto(updated);
}

export async function removeAnnouncementImage(id: number, actor: Actor) {
  const existing = await announcementRepository.findAnnouncementById(id);
  if (!existing) throw AppError.notFound("Announcement not found.");
  const updated = await announcementRepository.setAnnouncementImage(id, null);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
    entityType: "announcement",
    entityId: id,
    description: `Removed the photo of announcement "${existing.title}"`,
  });
  return toAnnouncementDto(updated);
}

export async function listStudentAnnouncements(limit = 20) {
  return (await announcementRepository.findVisibleAnnouncements(["PUBLIC", "STUDENTS"], limit)).map(toPublicAnnouncementDto);
}

export async function listAnnouncements(query: ListAnnouncementsQuery) {
  const { page, pageSize, ...filters } = query;
  const { items, total } = await announcementRepository.listAnnouncements({ ...filters, ...toSkipTake({ page, pageSize }) });
  return { items: items.map(toAnnouncementDto), meta: buildPaginationMeta({ page, pageSize }, total) };
}

export async function createAnnouncement(input: AnnouncementInput, actor: Actor) {
  const announcement = await announcementRepository.createAnnouncement({ ...input, createdById: actor.userId });
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.ANNOUNCEMENT_CREATED,
    entityType: "announcement",
    entityId: announcement.id,
    description: `Created announcement "${announcement.title}" (${announcement.status})`,
  });
  // Published and live now? Email it to students (each announcement only once).
  if (announcement.status === "PUBLISHED") notifyLater("announcement", () => sendDueAnnouncementEmails());
  return toAnnouncementDto(announcement);
}

export async function updateAnnouncement(id: number, input: AnnouncementInput, actor: Actor) {
  const existing = await announcementRepository.findAnnouncementById(id);
  if (!existing) throw AppError.notFound("Announcement not found.");
  const announcement = await announcementRepository.updateAnnouncement(id, input);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
    entityType: "announcement",
    entityId: id,
    description: `Updated announcement "${announcement.title}"${existing.status !== announcement.status ? ` (${existing.status} → ${announcement.status})` : ""}`,
  });
  if (announcement.status === "PUBLISHED") notifyLater("announcement", () => sendDueAnnouncementEmails());
  return toAnnouncementDto(announcement);
}
