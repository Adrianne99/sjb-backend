// Database access for admission requirements.
import { prisma } from "../config/database";
import type { Prisma, RequirementStatus } from "../generated/prisma/client";

const orderTypes = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export function findRequirementTypes(options: { activeOnly: boolean }) {
  return prisma.requirementType.findMany({ where: options.activeOnly ? { isActive: true } : {}, orderBy: orderTypes });
}

export function findRequirementTypeById(id: number) {
  return prisma.requirementType.findUnique({ where: { id } });
}

export function createRequirementType(data: Prisma.RequirementTypeCreateInput) {
  return prisma.requirementType.create({ data });
}

export function updateRequirementType(id: number, data: Prisma.RequirementTypeUpdateInput) {
  return prisma.requirementType.update({ where: { id }, data });
}

export function findStudentRequirements(studentId: number) {
  return prisma.studentRequirement.findMany({
    where: { studentId },
    include: { updatedBy: { select: { username: true } } },
  });
}

export function upsertStudentRequirement(
  studentId: number,
  requirementTypeId: number,
  data: { status: RequirementStatus; submittedDate: Date | null; remarks: string | null; updatedById: number | null },
) {
  return prisma.studentRequirement.upsert({
    where: { studentId_requirementTypeId: { studentId, requirementTypeId } },
    create: { studentId, requirementTypeId, ...data },
    update: data,
    include: { updatedBy: { select: { username: true } } },
  });
}

/** "Has this document with this status." PENDING also matches students with no row yet. */
export function hasRequirementStatus(requirementTypeId: number, status: RequirementStatus): Prisma.StudentWhereInput {
  if (status === "PENDING") {
    return { requirements: { none: { requirementTypeId, status: { in: ["SUBMITTED", "VERIFIED"] } } } };
  }
  return { requirements: { some: { requirementTypeId, status } } };
}

export interface ComplianceFilters {
  where: Prisma.StudentWhereInput;
  skip: number;
  take: number;
}

export async function findStudentsForCompliance(filters: ComplianceFilters) {
  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where: filters.where,
      include: { program: true, requirements: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.student.count({ where: filters.where }),
  ]);
  return { items, total };
}
