// Database access for login sessions and password-reset tokens.
import { prisma, type DbClient } from "../config/database";
import { userWithIdentityInclude } from "./user.repository";

export function createSession(
  data: {
    tokenHash: string;
    csrfToken: string;
    userId: number;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  },
  db: DbClient = prisma,
) {
  return db.session.create({ data });
}

export function findSessionByTokenHash(tokenHash: string) {
  return prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: userWithIdentityInclude } },
  });
}

export function touchSession(id: number) {
  return prisma.session.update({ where: { id }, data: { lastSeenAt: new Date() } });
}

export function deleteSessionById(id: number, db: DbClient = prisma) {
  return db.session.deleteMany({ where: { id } });
}

/** Logs a user out everywhere (optionally keeping the current session). */
export function deleteUserSessions(userId: number, exceptSessionId?: number, db: DbClient = prisma) {
  return db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
  });
}

export function deleteExpiredSessions(userId: number, db: DbClient = prisma) {
  return db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
}

// --- Password reset tokens ---------------------------------------------------

export function createPasswordResetToken(
  data: { userId: number; tokenHash: string; expiresAt: Date },
  db: DbClient = prisma,
) {
  return db.passwordResetToken.create({ data });
}

export function findPasswordResetToken(tokenHash: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { include: userWithIdentityInclude } },
  });
}

export function markPasswordResetTokenUsed(id: number, db: DbClient = prisma) {
  return db.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
}

/** Any older unused reset links stop working once a new one is issued or used. */
export function invalidateUserResetTokens(userId: number, db: DbClient = prisma) {
  return db.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
