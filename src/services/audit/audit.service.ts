// Writes audit log entries for important actions.
//
//   await recordAudit(actor, {
//     action: AUDIT_ACTIONS.PAYMENT_VOIDED,
//     entityType: "payment", entityId: payment.id,
//     description: `Voided payment OR-1234 (reason: duplicate entry)`,
//   }, tx);
import { prisma, type DbClient } from "../../config/database";
import type { Prisma } from "../../generated/prisma/client";
import * as auditRepository from "../../repositories/audit.repository";
import type { Actor } from "../../types/auth.types";
import { buildPaginationMeta, toSkipTake, type PaginationQuery } from "../../utils/pagination";

export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET: "PASSWORD_RESET",
  ACCOUNT_CREATED: "ACCOUNT_CREATED",
  APPLICATION_SUBMITTED: "APPLICATION_SUBMITTED",
  APPLICATION_CONVERTED: "APPLICATION_CONVERTED",
  APPLICATION_REJECTED: "APPLICATION_REJECTED",
  ACCOUNT_UPDATED: "ACCOUNT_UPDATED",
  ACCOUNT_ACTIVATED: "ACCOUNT_ACTIVATED",
  ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
  ROLE_CHANGED: "ROLE_CHANGED",
  STUDENT_CREATED: "STUDENT_CREATED",
  STUDENT_UPDATED: "STUDENT_UPDATED",
  STUDENT_ARCHIVED: "STUDENT_ARCHIVED",
  STUDENT_RESTORED: "STUDENT_RESTORED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  ENROLLMENT_CREATED: "ENROLLMENT_CREATED",
  ENROLLMENT_UPDATED: "ENROLLMENT_UPDATED",
  ENROLLMENT_SUBJECT_ADDED: "ENROLLMENT_SUBJECT_ADDED",
  ENROLLMENT_SUBJECT_REMOVED: "ENROLLMENT_SUBJECT_REMOVED",
  REQUIREMENT_UPDATED: "REQUIREMENT_UPDATED",
  FEES_APPLIED: "FEES_APPLIED",
  ASSESSMENT_CREATED: "ASSESSMENT_CREATED",
  ASSESSMENT_UPDATED: "ASSESSMENT_UPDATED",
  GRADE_CREATED: "GRADE_CREATED",
  GRADE_UPDATED: "GRADE_UPDATED",
  GRADE_PUBLISHED: "GRADE_PUBLISHED",
  GRADES_SUBMITTED: "GRADES_SUBMITTED",
  GRADES_RETURNED: "GRADES_RETURNED",
  ATTENDANCE_RECORDED: "ATTENDANCE_RECORDED",
  SCHEDULE_CREATED: "SCHEDULE_CREATED",
  SCHEDULE_UPDATED: "SCHEDULE_UPDATED",
  SCHEDULE_DELETED: "SCHEDULE_DELETED",
  PAYMENT_RECORDED: "PAYMENT_RECORDED",
  PAYMENT_UPDATED: "PAYMENT_UPDATED",
  PAYMENT_VOIDED: "PAYMENT_VOIDED",
  ANNOUNCEMENT_CREATED: "ANNOUNCEMENT_CREATED",
  ANNOUNCEMENT_UPDATED: "ANNOUNCEMENT_UPDATED",
  ACADEMIC_RECORD_CREATED: "ACADEMIC_RECORD_CREATED",
  ACADEMIC_RECORD_UPDATED: "ACADEMIC_RECORD_UPDATED",
  ACADEMIC_RECORD_DELETED: "ACADEMIC_RECORD_DELETED",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | number | null;
  description: string;
  /** Extra structured details, e.g. { before: {...}, after: {...} }. Never put passwords here. */
  metadata?: Prisma.InputJsonValue;
}

export async function recordAudit(actor: Actor, entry: AuditEntry, db: DbClient = prisma) {
  await auditRepository.insertAuditLog(
    {
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
      description: entry.description.slice(0, 500),
      metadata: entry.metadata,
    },
    db,
  );
}

type AuditLogRow = Awaited<ReturnType<typeof auditRepository.listRecentAuditLogs>>[number];

export function toAuditLogDto(log: AuditLogRow) {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    description: log.description,
    ipAddress: log.ipAddress,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
    user: log.user ? { id: log.user.id, username: log.user.username, role: log.user.role.name } : null,
  };
}

export async function listAuditLogs(
  filters: Omit<auditRepository.ListAuditLogFilters, "skip" | "take">,
  pagination: PaginationQuery,
) {
  const { items, total } = await auditRepository.listAuditLogs({ ...filters, ...toSkipTake(pagination) });
  return { items: items.map(toAuditLogDto), meta: buildPaginationMeta(pagination, total) };
}
