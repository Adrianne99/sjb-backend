// Database access for audit logs. Insert and read only — no update/delete.
import { prisma, type DbClient } from "../config/database";
import type { Prisma } from "../generated/prisma/client";

export function insertAuditLog(data: Prisma.AuditLogUncheckedCreateInput, db: DbClient = prisma) {
  return db.auditLog.create({ data });
}

export interface ListAuditLogFilters {
  search?: string;
  action?: string;
  entityType?: string;
  userId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  skip: number;
  take: number;
}

export async function listAuditLogs(filters: ListAuditLogFilters) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? { createdAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lt: filters.dateTo } : {}) } }
      : {}),
    ...(filters.search
      ? { OR: [{ description: { contains: filters.search } }, { user: { username: { contains: filters.search } } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, username: true, role: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

export function listRecentAuditLogs(take: number) {
  return prisma.auditLog.findMany({
    include: { user: { select: { id: true, username: true, role: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}
