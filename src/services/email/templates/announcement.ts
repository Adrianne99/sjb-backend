// School announcement — sent to students when an announcement is published.
import { longDate, portalUrl, renderEmail } from "./layout";

export interface AnnouncementEmailData {
  title: string;
  content: string; // plain text (line breaks are kept)
  publishDate: string;
}

export function announcementEmail(data: AnnouncementEmailData) {
  return renderEmail({
    subject: `Announcement: ${data.title}`,
    title: data.title,
    preheader: data.content.replace(/\s+/g, " ").slice(0, 120),
    blocks: [
      { type: "note", text: `Posted ${longDate(data.publishDate)}` },
      { type: "paragraph", text: data.content },
      { type: "button", label: "See all announcements", url: portalUrl("/announcements") },
    ],
    audience: "student",
  });
}
