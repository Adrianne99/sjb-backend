// =============================================================================
// Authorization matrix — the single source of truth for "who can do what".
//
// Routes use `requirePermission("students:write")`. To change access, edit
// this file only. The frontend receives the user's permission list from
// GET /api/auth/me for display purposes, but the backend always re-checks.
// =============================================================================
import type { RoleName } from "../generated/prisma/client";

const ADMIN_STAFF: RoleName[] = ["ADMIN", "STAFF"];
const ADMIN_ONLY: RoleName[] = ["ADMIN"];
const STUDENT_ONLY: RoleName[] = ["STUDENT"];

export const PERMISSIONS = {
  // Students & accounts
  "students:read": ADMIN_STAFF,
  "students:write": ADMIN_STAFF,
  "students:archive": ADMIN_STAFF,
  "student-accounts:manage": ADMIN_STAFF,

  // Online pre-registration ("Enroll Now" on the website)
  "applications:read": ADMIN_STAFF,
  "applications:write": ADMIN_STAFF,

  // Admission requirements (Form 137, Diploma, Form 138, Good Moral)
  "requirements:read": ADMIN_STAFF,
  "requirements:write": ADMIN_STAFF,

  // Enrollment & assessments (charges)
  "enrollments:read": ADMIN_STAFF,
  "enrollments:write": ADMIN_STAFF,
  "assessments:write": ADMIN_STAFF,

  // Grades
  "grades:read": ADMIN_STAFF,
  "grades:write": ADMIN_STAFF,
  "grades:publish": ADMIN_STAFF,
  // Change a PUBLISHED grade (e.g. completing an INC) — a reason is always required and audited.
  "grades:edit-published": ADMIN_STAFF,

  // Schedules
  "schedules:read": ADMIN_STAFF,
  "schedules:write": ADMIN_STAFF,

  // Payments
  "payments:read": ADMIN_STAFF,
  "payments:record": ADMIN_STAFF,
  "payments:void": ADMIN_STAFF,
  "payments:edit": ADMIN_ONLY,

  // Reports & announcements
  "reports:read": ADMIN_STAFF,
  "announcements:manage": ADMIN_STAFF,

  // Academic setup (programs, terms, sections, subjects, instructors, rooms)
  "academic:read": ADMIN_STAFF,
  "academic:manage": ADMIN_ONLY,

  // Administration
  "users:manage": ADMIN_ONLY,
  "audit:read": ADMIN_ONLY,
  "settings:manage": ADMIN_ONLY,

  // Student self-service portal (/api/me/*)
  "portal:self": STUDENT_ONLY,
} as const satisfies Record<string, readonly RoleName[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleHasPermission(role: RoleName, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly RoleName[]).includes(role);
}

export function permissionsForRole(role: RoleName): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((permission) =>
    roleHasPermission(role, permission),
  );
}
