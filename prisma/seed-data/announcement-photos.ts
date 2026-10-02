// Sample cover photos for the demo announcements (CC0, see announcement-photos/CREDITS.md).
// Matched by title; announcements that already have a photo are left alone.
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";

const PHOTO_DIR = path.join(process.cwd(), "prisma", "seed-data", "announcement-photos");

/** Announcement title -> photo file. */
export const SAMPLE_PHOTOS: Record<string, string> = {
  "Second Semester enrollment schedule": "enrollment-schedule.jpg",
  "Student Portal now available": "student-portal.jpg",
  "Reminder: settle your second installment": "installment-reminder.jpg",
  "Library hours during midterm week": "library-hours.jpg",
  "Foundation Day activities (draft)": "foundation-day.jpg",
};

/** Returns how many announcements got a photo. */
export async function attachSamplePhotos(prisma: PrismaClient) {
  let attached = 0;
  for (const [title, file] of Object.entries(SAMPLE_PHOTOS)) {
    const result = await prisma.announcement.updateMany({
      where: { title, imageType: null },
      data: { imageData: new Uint8Array(fs.readFileSync(path.join(PHOTO_DIR, file))), imageType: "image/jpeg", imageUpdatedAt: new Date() },
    });
    attached += result.count;
  }
  return attached;
}
