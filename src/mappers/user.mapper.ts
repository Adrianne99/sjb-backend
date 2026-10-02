// Converts database rows into safe API objects.
// IMPORTANT: never return `passwordHash` or token columns to the client.
import { permissionsForRole } from "../config/permissions";
import type { UserWithIdentity } from "../repositories/user.repository";
import type { AuthUser } from "../types/auth.types";
import { fullName } from "../utils/person";

export function displayNameFor(user: UserWithIdentity): string {
  if (user.student) return fullName(user.student);
  if (user.staffProfile) return `${user.staffProfile.firstName} ${user.staffProfile.lastName}`;
  return user.username;
}

export function toAuthUser(user: UserWithIdentity): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role.name,
    mustChangePassword: user.mustChangePassword,
    displayName: displayNameFor(user),
    studentId: user.student?.id ?? null,
    studentNumber: user.student?.studentNumber ?? null,
  };
}

/** What GET /api/auth/me returns (adds permissions for the UI). */
export function toCurrentUserDto(user: AuthUser) {
  return { ...user, permissions: permissionsForRole(user.role) };
}

/** Account row for the User Management screen. */
export function toUserAccountDto(user: UserWithIdentity) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role.name,
    displayName: displayNameFor(user),
    firstName: user.staffProfile?.firstName ?? user.student?.firstName ?? null,
    lastName: user.staffProfile?.lastName ?? user.student?.lastName ?? null,
    position: user.staffProfile?.position ?? null,
    studentId: user.student?.id ?? null,
    studentNumber: user.student?.studentNumber ?? null,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    isLocked: Boolean(user.lockedUntil && user.lockedUntil > new Date()),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
