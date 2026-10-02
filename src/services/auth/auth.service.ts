// Login, logout, password change and password reset — the business rules.
import { ACCOUNT_LOCK_MINUTES, MAX_FAILED_LOGIN_ATTEMPTS, PASSWORD_RESET_TOKEN_MINUTES } from "../../config/constants";
import { prisma } from "../../config/database";
import { displayNameFor, toAuthUser } from "../../mappers/user.mapper";
import * as sessionRepository from "../../repositories/session.repository";
import * as userRepository from "../../repositories/user.repository";
import type { Actor, AuthUser } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { generateToken, hashToken } from "../../utils/crypto";
import {
  birthdatePassword,
  checkPasswordStrength,
  hashPassword,
  verifyAgainstDummyHash,
  verifyPassword,
} from "../../utils/password";
import type { ChangePasswordInput, LoginInput, ResetPasswordInput } from "../../validators/auth.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import * as emailService from "../email/email.service";
import { startSession } from "./session.service";

const INVALID_CREDENTIALS = new AppError(401, "INVALID_CREDENTIALS", "Invalid student number/username or password.");

export async function login(input: LoginInput, client: { ipAddress: string | null; userAgent: string | null }) {
  const user = await userRepository.findUserByLoginIdentifier(input.identifier);

  if (!user) {
    await verifyAgainstDummyHash(input.password); // same timing as a real check
    throw INVALID_CREDENTIALS;
  }

  const actor: Actor = { userId: user.id, role: user.role.name, ipAddress: client.ipAddress };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(
      423,
      "ACCOUNT_LOCKED",
      `Too many failed attempts. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
    );
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await userRepository.updateUser(user.id, {
      failedLoginAttempts: shouldLock ? 0 : attempts,
      lockedUntil: shouldLock ? new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60000) : user.lockedUntil,
    });
    await recordAudit(actor, {
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "user",
      entityId: user.id,
      description: shouldLock
        ? `Account ${user.username} locked for ${ACCOUNT_LOCK_MINUTES} minutes after ${MAX_FAILED_LOGIN_ATTEMPTS} failed logins`
        : `Failed login for ${user.username}`,
    });
    throw INVALID_CREDENTIALS;
  }

  // Only reveal "deactivated" after a correct password (avoids account probing).
  if (!user.isActive) {
    throw new AppError(403, "ACCOUNT_DISABLED", "This account is deactivated. Please contact the Registrar's Office.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await userRepository.updateUser(
      user.id,
      { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      tx,
    );
    const session = await startSession(
      { userId: user.id, rememberMe: input.rememberMe, ipAddress: client.ipAddress, userAgent: client.userAgent },
      tx,
    );
    await recordAudit(
      actor,
      { action: AUDIT_ACTIONS.LOGIN, entityType: "user", entityId: user.id, description: `${user.username} logged in` },
      tx,
    );
    return { user: toAuthUser(updated), ...session };
  });

  return result;
}

export async function logout(actor: Actor, sessionId: number) {
  await sessionRepository.deleteSessionById(sessionId);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.LOGOUT,
    entityType: "user",
    entityId: actor.userId,
    description: "Logged out",
  });
}

export async function changePassword(
  authUser: AuthUser,
  sessionId: number,
  input: ChangePasswordInput,
  actor: Actor,
) {
  const user = await userRepository.findUserById(authUser.id);
  if (!user) throw AppError.unauthorized();

  const currentOk = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!currentOk) {
    throw AppError.validation({ currentPassword: "Current password is incorrect." });
  }
  if (input.currentPassword === input.newPassword) {
    throw AppError.validation({ newPassword: "New password must be different from your current password." });
  }

  // Students may not "change" to their birthdate-based temporary password.
  const forbidden = user.student ? [birthdatePassword(user.student.dateOfBirth)] : [];
  const strengthError = checkPasswordStrength(input.newPassword, { username: user.username, forbidden });
  if (strengthError) throw AppError.validation({ newPassword: strengthError });

  const passwordHash = await hashPassword(input.newPassword);

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await userRepository.updateUser(
      user.id,
      { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      tx,
    );
    // Sign out other devices; keep this one.
    await sessionRepository.deleteUserSessions(user.id, sessionId, tx);
    await sessionRepository.invalidateUserResetTokens(user.id, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        entityType: "user",
        entityId: user.id,
        description: user.mustChangePassword
          ? `${user.username} replaced their temporary password`
          : `${user.username} changed their password`,
      },
      tx,
    );
    return saved;
  });

  if (updated.email && updated.notifyAccountActivity) {
    void emailService.sendPasswordChangedEmail({ to: updated.email, name: displayNameFor(updated) });
  }

  return toAuthUser(updated);
}

/**
 * Starts a password reset. Always succeeds from the caller's point of view so
 * nobody can use this form to discover which accounts exist.
 */
export async function requestPasswordReset(identifier: string, actor: Actor) {
  const user = await userRepository.findUserByLoginIdentifier(identifier);
  // Reset links go to the account's email address only.
  const email = user?.email;
  if (!user || !user.isActive || !email) return;

  const token = generateToken();
  await prisma.$transaction(async (tx) => {
    await sessionRepository.invalidateUserResetTokens(user.id, tx);
    await sessionRepository.createPasswordResetToken(
      {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_MINUTES * 60000),
      },
      tx,
    );
    await recordAudit(
      { ...actor, userId: user.id },
      {
        action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
        entityType: "user",
        entityId: user.id,
        description: `Password reset requested for ${user.username}`,
      },
      tx,
    );
  });

  await emailService.sendPasswordResetEmail({
    to: email,
    name: displayNameFor(user),
    token,
    expiresInMinutes: PASSWORD_RESET_TOKEN_MINUTES,
  });
}

export async function resetPassword(input: ResetPasswordInput, actor: Actor) {
  const record = await sessionRepository.findPasswordResetToken(hashToken(input.token));

  if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.isActive) {
    throw AppError.badRequest("This password reset link is invalid or has expired. Please request a new one.");
  }

  const user = record.user;
  const forbidden = user.student ? [birthdatePassword(user.student.dateOfBirth)] : [];
  const strengthError = checkPasswordStrength(input.newPassword, { username: user.username, forbidden });
  if (strengthError) throw AppError.validation({ newPassword: strengthError });

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    await userRepository.updateUser(
      user.id,
      { passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      tx,
    );
    await sessionRepository.markPasswordResetTokenUsed(record.id, tx);
    await sessionRepository.invalidateUserResetTokens(user.id, tx);
    await sessionRepository.deleteUserSessions(user.id, undefined, tx); // sign out everywhere
    await recordAudit(
      { ...actor, userId: user.id },
      {
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        entityType: "user",
        entityId: user.id,
        description: `${user.username} reset their password using an email link`,
      },
      tx,
    );
  });
}
