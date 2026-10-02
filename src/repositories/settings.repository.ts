import { prisma } from "../config/database";
import type { Prisma } from "../generated/prisma/client";

export function findSetting(key: string) {
  return prisma.systemSetting.findUnique({ where: { key } });
}

export function upsertSetting(key: string, value: Prisma.InputJsonValue, updatedById: number | null) {
  return prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedById },
    update: { value, updatedById },
  });
}
