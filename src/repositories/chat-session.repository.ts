// Database access for SJB Assistant chat sessions (table: chat_sessions).
// Only token HASHES are passed in here — raw tokens never reach the database.
import { prisma, type DbClient } from "../config/database";

export function createChatSession(
  data: { sessionTokenHash: string; userId: number | null; createdAt: Date; expiresAt: Date },
  db: DbClient = prisma,
) {
  return db.chatSession.create({
    data: { ...data, lastActivityAt: data.createdAt },
  });
}

export function findChatSessionByTokenHash(sessionTokenHash: string) {
  return prisma.chatSession.findUnique({ where: { sessionTokenHash } });
}

/**
 * Records activity and moves the expiry forward.
 * The WHERE clause only matches a session that is still usable at `now`, so a
 * session that expired (or was revoked) a moment ago can never be revived.
 * Returns how many rows changed (0 = the session is no longer usable).
 */
export async function recordChatActivity(id: string, now: Date, expiresAt: Date) {
  const result = await prisma.chatSession.updateMany({
    where: { id, revokedAt: null, expiresAt: { gt: now } },
    data: { lastActivityAt: now, expiresAt },
  });
  return result.count;
}

/** Ends a session for good. Already-revoked sessions keep their first revoke time. */
export function revokeChatSession(id: string, now = new Date()) {
  return prisma.chatSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
}

/**
 * After a verified login: links the session to the account and replaces its
 * token (the old cookie stops working, which prevents session fixation).
 */
export function linkChatSessionToUser(id: string, userId: number, newTokenHash: string) {
  return prisma.chatSession.update({
    where: { id },
    data: { userId, sessionTokenHash: newTokenHash },
  });
}

/**
 * Cleanup: deletes sessions that ended (expired or revoked) before `endedBefore`.
 * Their messages are deleted too (ON DELETE CASCADE). Active sessions always
 * have expires_at in the future and revoked_at NULL, so they never match.
 */
export async function deleteEndedChatSessions(endedBefore: Date) {
  const result = await prisma.chatSession.deleteMany({
    where: { OR: [{ expiresAt: { lt: endedBefore } }, { revokedAt: { lt: endedBefore } }] },
  });
  return result.count;
}
