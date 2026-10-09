import { prisma } from "../config/database";
import type { AnnouncementAudience, AnnouncementCategory, AnnouncementStatus, Prisma } from "../generated/prisma/client";

const include = { createdBy: { select: { username: true } } } satisfies Prisma.AnnouncementInclude;
/** Photos are large, so normal queries never load them (see findAnnouncementImage). */
const omit = { imageData: true } satisfies Prisma.AnnouncementOmit;

export interface ListAnnouncementsFilters {
  search?: string;
  status?: AnnouncementStatus;
  audience?: AnnouncementAudience;
  category?: AnnouncementCategory;
  skip: number;
  take: number;
}

export async function listAnnouncements(filters: ListAnnouncementsFilters) {
  const where: Prisma.AnnouncementWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.audience ? { audience: filters.audience } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.search ? { OR: [{ title: { contains: filters.search } }, { content: { contains: filters.search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({ where, include, omit, orderBy: { publishDate: "desc" }, skip: filters.skip, take: filters.take }),
    prisma.announcement.count({ where }),
  ]);
  return { items, total };
}

/** Published, already live, not yet expired — for the given audiences. */
export function findVisibleAnnouncements(audiences: AnnouncementAudience[], take: number) {
  const now = new Date();
  return prisma.announcement.findMany({
    where: {
      status: "PUBLISHED",
      audience: { in: audiences },
      publishDate: { lte: now },
      OR: [{ expirationDate: null }, { expirationDate: { gt: now } }],
    },
    include,
    omit,
    orderBy: { publishDate: "desc" },
    take,
  });
}

export function findAnnouncementById(id: number) {
  return prisma.announcement.findUnique({ where: { id }, include, omit });
}

export function createAnnouncement(data: Prisma.AnnouncementUncheckedCreateInput) {
  return prisma.announcement.create({ data, include, omit });
}

export function updateAnnouncement(id: number, data: Prisma.AnnouncementUncheckedUpdateInput) {
  return prisma.announcement.update({ where: { id }, data, include, omit });
}

/** The photo itself (only the image endpoint loads it). */
export function findAnnouncementImage(id: number) {
  return prisma.announcement.findUnique({
    where: { id },
    select: { id: true, status: true, audience: true, publishDate: true, expirationDate: true, imageData: true, imageType: true, imageUpdatedAt: true },
  });
}

export function setAnnouncementImage(id: number, image: { data: Uint8Array<ArrayBuffer>; type: string } | null) {
  return prisma.announcement.update({
    where: { id },
    data: { imageData: image?.data ?? null, imageType: image?.type ?? null, imageUpdatedAt: image ? new Date() : null },
    include,
    omit,
  });
}
