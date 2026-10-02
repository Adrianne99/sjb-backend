import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { requiredText, searchQuery } from "./common.validators";

/** Accepts "2026-10-01" or a full ISO date-time. */
const dateTime = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .refine((value) => !Number.isNaN(new Date(value).getTime()), `${label} is not a valid date.`)
    .transform((value) => new Date(value));

export const announcementSchema = z
  .object({
    title: requiredText("Title", 200),
    content: requiredText("Content", 10_000),
    audience: z.enum(["PUBLIC", "STUDENTS"]).default("PUBLIC"),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
    publishDate: dateTime("Publish date"),
    expirationDate: dateTime("Expiration date").nullish(),
  })
  .refine((data) => !data.expirationDate || data.expirationDate > data.publishDate, {
    message: "Expiration must be after the publish date.",
    path: ["expirationDate"],
  });

export const listAnnouncementsQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  audience: z.enum(["PUBLIC", "STUDENTS"]).optional(),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
