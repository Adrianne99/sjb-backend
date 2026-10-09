// =============================================================================
// Authorization matrix — the single source of truth for "who can do what".
//
// Routes use `requirePermission("students:write")`. To change access, edit
// this file only. The frontend receives the user's permission list from
// GET /api/auth/me for display purposes, but the backend always re-checks.
//
// Roles
//   ADMIN      superadministrator — everything
//   STAFF      all-around office staff (registrar + cashier work, grades, schedules, reports)
//   REGISTRAR  enrollment: students, applications, requirements, enrollment, tuition fees
//   CASHIER    payments: find a student, see balances, record payments
//   TEACHER    own classes only (linked to an instructor): schedule, rosters, draft grades
//   STUDENT    the student portal only
// =============================================================================
import type { RoleName } from "../generated/prisma/client";

const ADMIN_ONLY: RoleName[] = ["ADMIN"];
const ADMIN_STAFF: RoleName[] = ["ADMIN", "STAFF"];
const WITH_REGISTRAR: RoleName[] = ["ADMIN", "STAFF", "REGISTRAR"];
const WITH_CASHIER: RoleName[] = ["ADMIN", "STAFF", "CASHIER"];
const ALL_OFFICE: RoleName[] = ["ADMIN", "STAFF", "REGISTRAR", "CASHIER"];
const STUDENT_ONLY: RoleName[] = ["STUDENT"];
const TEACHER_ONLY: RoleName[] = ["TEACHER"];

export const PERMISSIONS = {
  // Office dashboard (each role only sees the parts it has permissions for)
  "dashboard:read": ALL_OFFICE,

  // Students & accounts (the cashier can look students up, but not change them)
  "students:read": ALL_OFFICE,
  "students:write": WITH_REGISTRAR,
  "students:archive": WITH_REGISTRAR,
  "student-accounts:manage": WITH_REGISTRAR,

  // Online pre-registration ("Enroll Now" on the website)
  "applications:read": WITH_REGISTRAR,
  "applications:write": WITH_REGISTRAR,

  // Admission requirements (Form 137, Diploma, Form 138, Good Moral)
  "requirements:read": WITH_REGISTRAR,
  "requirements:write": WITH_REGISTRAR,

  // Enrollment & assessments (charges, e.g. applying the tuition fee option)
  "enrollments:read": WITH_REGISTRAR,
  "enrollments:write": WITH_REGISTRAR,
  "assessments:write": WITH_REGISTRAR,

  // Grades
  "grades:read": ADMIN_STAFF,
  "grades:write": ADMIN_STAFF,
  "grades:publish": ADMIN_STAFF,
  // Change a PUBLISHED grade (e.g. completing an INC) — a reason is always required and audited.
  "grades:edit-published": ADMIN_STAFF,

  // Schedules (the registrar may look at them, e.g. to pick a section)
  "schedules:read": WITH_REGISTRAR,
  "schedules:write": ADMIN_STAFF,

  // Payments (the cashier records them; voiding/correcting stays with staff and admin)
  "payments:read": WITH_CASHIER,
  "payments:record": WITH_CASHIER,
  "payments:void": ADMIN_STAFF,
  "payments:edit": ADMIN_ONLY,

  // Reports & announcements
  "reports:read": ADMIN_STAFF,
  "announcements:manage": ADMIN_STAFF,

  // Academic setup (programs, terms, sections, subjects, instructors, rooms)
  "academic:read": [...ALL_OFFICE, "TEACHER"],
  "academic:manage": ADMIN_ONLY,

  // Administration
  "users:manage": ADMIN_ONLY,
  "audit:read": ADMIN_ONLY,
  "settings:manage": ADMIN_ONLY,

  // My Account (/api/account): own name, email, contact number, email settings. Every office role.
  "account:self": [...ALL_OFFICE, "TEACHER"],

  // Teacher's own classes (/api/teaching/*): schedule, rosters, saving DRAFT grades.
  // Publishing grades stays with staff ("grades:publish").
  "teaching:own": TEACHER_ONLY,

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
