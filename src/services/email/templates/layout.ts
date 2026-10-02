// =============================================================================
// SAINT JOHN BOSCO EMAIL LAYOUT — shared by every email the system sends.
//
// An email is a list of simple "blocks" (paragraph, details, table, button...).
// `renderEmail` turns the blocks into BOTH versions every email needs:
//   - html: branded, works in Gmail / Outlook / phone mail apps
//           (tables + inline styles only; web fonts are not reliable in email)
//   - text: plain-text version for mail apps that do not show HTML
// All text is escaped, so user-entered content can never inject HTML.
// =============================================================================
import { env } from "../../../config/env";

export const SCHOOL_NAME = "Saint John Bosco Institute of Arts and Sciences";
export const SCHOOL_LOCATION = "Kalentong, Mandaluyong City";

// Brand colors (same as frontend/src/styles/theme.css).
const COLORS = {
  navy: "#132552",
  royal: "#1f4aa8",
  gold: "#e5b324",
  ink: "#0f1b33",
  soft: "#3e4c66",
  muted: "#66738c",
  border: "#dce2ec",
  page: "#f4f6fa",
  panel: "#f7f9fc",
  success: "#1c5933",
  successBg: "#edf7f0",
};
const FONT = "Arial, Helvetica, sans-serif";

export type EmailBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  /** Label / value pairs, e.g. "Section: IT 1-A". */
  | { type: "details"; rows: Array<[label: string, value: string]> }
  /** A small table, e.g. the class schedule. */
  | { type: "table"; columns: string[]; rows: string[][]; alignRight?: number[]; noWrap?: number[] }
  | { type: "button"; label: string; url: string }
  /** A colored box for the most important line, e.g. "Fully paid". */
  | { type: "highlight"; text: string; tone?: "gold" | "success" }
  /** Small grey text. */
  | { type: "note"; text: string };

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailOptions {
  subject: string;
  /** Big title at the top of the email. */
  title: string;
  /** Short line mail apps show next to the subject in the inbox. */
  preheader?: string;
  blocks: EmailBlock[];
  /** "student" emails mention how to turn notifications off. */
  audience?: "student" | "account";
}

/** Escapes text before putting it into email HTML. */
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Escapes text and keeps its line breaks. */
const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br />");

/** "₱2,870.00" — amounts are money strings from the backend. */
export function peso(value: string | number) {
  return `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "July 7, 2026" from "2026-07-07" (or a Date). */
export function longDate(value: string | Date) {
  const day = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  return day.toLocaleDateString("en-PH", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

/** "1:00 PM" from "13:00". */
export function clockTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** "1:00–2:30 PM", or "11:30 AM–1:00 PM" when it crosses noon. */
export function timeRange(start: string, end: string) {
  const [from, to] = [clockTime(start), clockTime(end)];
  const samePeriod = from.slice(-2) === to.slice(-2);
  return samePeriod ? `${from.slice(0, -3)}–${to}` : `${from}–${to}`;
}

/** Full link into the website, e.g. portalUrl("/student/schedule"). */
export const portalUrl = (path: string) => `${env.FRONTEND_URL.replace(/\/$/, "")}${path}`;

// --- HTML -----------------------------------------------------------------------

function blockHtml(block: EmailBlock): string {
  switch (block.type) {
    case "paragraph":
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLORS.ink}">${multiline(block.text)}</p>`;
    case "heading":
      return `<h3 style="margin:22px 0 10px;font-size:15px;color:${COLORS.navy}">${escapeHtml(block.text)}</h3>`;
    case "details":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:8px">
        ${block.rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:8px 14px;font-size:13px;color:${COLORS.muted};width:40%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 14px;font-size:14px;color:${COLORS.ink};font-weight:bold">${multiline(value)}</td></tr>`,
          )
          .join("")}
      </table>`;
    case "table": {
      const align = (index: number) => (block.alignRight?.includes(index) ? "right" : "left");
      const wrap = (index: number) => (block.noWrap?.includes(index) ? "white-space:nowrap;" : "");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${COLORS.border};border-radius:8px;border-collapse:separate;overflow:hidden">
        <tr>${block.columns.map((column, index) => `<th style="padding:8px 10px;background:${COLORS.panel};font-size:12px;color:${COLORS.muted};text-align:${align(index)};border-bottom:1px solid ${COLORS.border}">${escapeHtml(column)}</th>`).join("")}</tr>
        ${block.rows
          .map(
            (row) =>
              `<tr>${row.map((cell, index) => `<td style="padding:8px 10px;font-size:13px;color:${COLORS.ink};${wrap(index)}text-align:${align(index)};border-bottom:1px solid ${COLORS.border};vertical-align:top">${multiline(cell)}</td>`).join("")}</tr>`,
          )
          .join("")}
      </table>`;
    }
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="border-radius:999px;background:${COLORS.royal}">
        <a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(block.label)}</a>
      </td></tr></table>`;
    case "highlight": {
      const success = block.tone === "success";
      return `<div style="margin:0 0 16px;padding:12px 14px;border-radius:8px;border-left:0;background:${success ? COLORS.successBg : "#fdf8e8"};color:${success ? COLORS.success : "#8a5c0e"};font-size:14px;font-weight:bold">${multiline(block.text)}</div>`;
    }
    case "note":
      return `<p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:${COLORS.muted}">${multiline(block.text)}</p>`;
  }
}

function footerLines(audience: EmailOptions["audience"]) {
  return [
    `${SCHOOL_NAME} · ${SCHOOL_LOCATION}`,
    "This is an automated message from the school management system. Please do not reply to this email.",
    ...(audience === "student" ? [`You can turn these emails on or off in the Student Portal under Settings: ${portalUrl("/student/settings")}`] : []),
  ];
}

// --- Plain text ---------------------------------------------------------------------

function blockText(block: EmailBlock): string {
  switch (block.type) {
    case "paragraph":
    case "note":
      return block.text;
    case "heading":
      return block.text.toUpperCase();
    case "highlight":
      return `>> ${block.text}`;
    case "details":
      return block.rows.map(([label, value]) => `${label}: ${value}`).join("\n");
    case "table":
      return block.rows.map((row) => `- ${row.filter(Boolean).join(" | ")}`).join("\n");
    case "button":
      return `${block.label}: ${block.url}`;
  }
}

/** Builds the subject, HTML and plain-text versions of one email. */
export function renderEmail(options: EmailOptions): EmailContent {
  const body = options.blocks.map(blockHtml).join("\n");
  const footer = footerLines(options.audience);

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(options.subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:${FONT}">
  ${options.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(options.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;font-family:${FONT}">
        <tr><td style="background:${COLORS.navy};padding:22px 28px">
          <div style="font-size:17px;font-weight:bold;color:#ffffff">${SCHOOL_NAME}</div>
          <div style="margin-top:4px;font-size:12px;color:#b3c8ec">${SCHOOL_LOCATION}</div>
        </td></tr>
        <tr><td style="height:4px;background:${COLORS.gold};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:28px">
          <h2 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:${COLORS.navy}">${escapeHtml(options.title)}</h2>
          ${body}
        </td></tr>
        <tr><td style="padding:18px 28px;background:${COLORS.panel};border-top:1px solid ${COLORS.border}">
          ${footer.map((line) => `<p style="margin:0 0 6px;font-size:11px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(line)}</p>`).join("")}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [options.title, "", ...options.blocks.map(blockText).flatMap((part) => [part, ""]), "--", ...footer].join("\n");
  return { subject: options.subject, html, text };
}
