// Date helpers.
//
// Date-only columns (birthdate, payment date) are stored as MySQL DATE and
// exchanged with the frontend as "YYYY-MM-DD" strings — no time zone surprises.
import { SCHOOL_TIME_ZONE } from "../config/constants";

/** "2001-01-01" -> Date at UTC midnight (how Prisma represents a DATE). */
export function fromDateOnlyString(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date -> "2001-01-01" */
export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toDateOnlyOrNull(date: Date | null | undefined): string | null {
  return date ? toDateOnlyString(date) : null;
}

/** Today's date in the Philippines as "YYYY-MM-DD". */
export function todayInManila(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(new Date());
}

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

/** Current weekday and "HH:MM" time in the Philippines. */
export function nowInManila(): { dayOfWeek: (typeof WEEKDAYS)[number]; time: string; dayIndex: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const dayOfWeek = get("weekday").toUpperCase() as (typeof WEEKDAYS)[number];
  return { dayOfWeek, time: `${get("hour")}:${get("minute")}`, dayIndex: WEEKDAYS.indexOf(dayOfWeek) };
}

export { WEEKDAYS };
