// App-wide constants. Change values here rather than hunting through code.

export const SESSION_COOKIE_NAME = "sjb_session";
export const CSRF_HEADER_NAME = "x-csrf-token";

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours (normal login)
export const REMEMBER_ME_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const ACCOUNT_LOCK_MINUTES = 15;

export const PASSWORD_RESET_TOKEN_MINUTES = 30;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Philippine time — used for "today", "next class", etc. */
export const SCHOOL_TIME_ZONE = "Asia/Manila";

/** Keys used in the system_settings table. */
export const SETTING_KEYS = {
  grading: "grading",
  gradingByLevel: "grading_by_level",
  studentEditableFields: "student_editable_fields",
} as const;
