// App-wide constants. Change values here rather than hunting through code.

export const SESSION_COOKIE_NAME = "sjb_session";
export const CSRF_HEADER_NAME = "x-csrf-token";

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours (normal login)
export const REMEMBER_ME_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** SJB Assistant chat session cookie (HttpOnly) and its CSRF header. */
export const CHAT_SESSION_COOKIE_NAME = "sjb_chat_session";
export const CHAT_CSRF_HEADER_NAME = "x-chat-csrf-token";
/** How many earlier messages of the same chat the AI sees (follow-up questions). */
export const CHAT_HISTORY_FOR_AI = 6;
/** How many messages GET /api/chatbot/messages returns (newest kept). */
export const CHAT_HISTORY_MAX_RETURNED = 50;
/** How often expired chat sessions are deleted. */
export const CHAT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

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
