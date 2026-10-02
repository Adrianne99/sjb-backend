// Admission requirements: the document list (Form 137, Diploma, Report Card /
// Form 138, Good Moral) and each student's submission status.
//
// Status meaning:  PENDING (not submitted) -> SUBMITTED (received) -> VERIFIED (checked).
// A student is "complete" when every ACTIVE requirement is VERIFIED.
import type { Prisma, RequirementStatus, RequirementType } from "../../generated/prisma/client";
import { toStudentSummaryDto } from "../../mappers/student.mapper";
import * as requirementRepository from "../../repositories/requirement.repository";
import * as studentRepository from "../../repositories/student.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { fromDateOnlyString, toDateOnlyOrNull, todayInManila } from "../../utils/dates";
import { buildPaginationMeta, toSkipTake } from "../../utils/pagination";
import { fullName } from "../../utils/person";
import type { ComplianceQuery, RequirementTypeInput, StudentRequirementInput } from "../../validators/requirement.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";

const STATUS_LABELS: Record<RequirementStatus, string> = { PENDING: "Pending", SUBMITTED: "Submitted", VERIFIED: "Verified" };

function toTypeDto(type: RequirementType) {
  return { id: type.id, code: type.code, name: type.name, description: type.description, sortOrder: type.sortOrder, isActive: type.isActive };
}

// --- The document list ----------------------------------------------------------

/** Public list for the landing page (active documents only). */
export async function listPublicRequirements() {
  const types = await requirementRepository.findRequirementTypes({ activeOnly: true });
  return types.map(({ id, code, name, description }) => ({ id, code, name, description }));
}

export async function listRequirementTypes() {
  return (await requirementRepository.findRequirementTypes({ activeOnly: false })).map(toTypeDto);
}

export async function createRequirementType(input: RequirementTypeInput, actor: Actor) {
  const type = await requirementRepository.createRequirementType(input);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.ACADEMIC_RECORD_CREATED,
    entityType: "requirement_type",
    entityId: type.id,
    description: `Added admission requirement "${type.name}"`,
  });
  return toTypeDto(type);
}

export async function updateRequirementType(id: number, input: RequirementTypeInput, actor: Actor) {
  if (!(await requirementRepository.findRequirementTypeById(id))) throw AppError.notFound("Requirement not found.");
  const type = await requirementRepository.updateRequirementType(id, input);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.ACADEMIC_RECORD_UPDATED,
    entityType: "requirement_type",
    entityId: id,
    description: `Updated admission requirement "${type.name}"${type.isActive ? "" : " (inactive)"}`,
  });
  return toTypeDto(type);
}

// --- One student's checklist -----------------------------------------------------

export async function getStudentChecklist(studentId: number) {
  const student = await studentRepository.findStudentById(studentId);
  if (!student) throw AppError.notFound("Student not found.");

  const [types, rows] = await Promise.all([
    requirementRepository.findRequirementTypes({ activeOnly: true }),
    requirementRepository.findStudentRequirements(studentId),
  ]);

  const items = types.map((type) => {
    const row = rows.find((item) => item.requirementTypeId === type.id);
    return {
      requirement: { id: type.id, code: type.code, name: type.name, description: type.description },
      status: row?.status ?? ("PENDING" as RequirementStatus),
      submittedDate: toDateOnlyOrNull(row?.submittedDate),
      remarks: row?.remarks ?? null,
      updatedBy: row?.updatedBy?.username ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });

  const count = (status: RequirementStatus) => items.filter((item) => item.status === status).length;
  return {
    items,
    summary: {
      total: items.length,
      verified: count("VERIFIED"),
      submitted: count("SUBMITTED"),
      pending: count("PENDING"),
      complete: items.length > 0 && count("VERIFIED") === items.length,
    },
  };
}

export async function updateStudentRequirement(studentId: number, requirementTypeId: number, input: StudentRequirementInput, actor: Actor) {
  const student = await studentRepository.findStudentById(studentId);
  if (!student) throw AppError.notFound("Student not found.");
  if (student.status === "ARCHIVED") throw AppError.badRequest("Restore this student before updating requirements.");

  const type = await requirementRepository.findRequirementTypeById(requirementTypeId);
  if (!type || !type.isActive) throw AppError.notFound("Requirement not found.");

  // A received document always has a date; default to today.
  const submittedDate =
    input.status === "PENDING" ? null : input.submittedDate ? fromDateOnlyString(input.submittedDate) : fromDateOnlyString(todayInManila());

  await requirementRepository.upsertStudentRequirement(studentId, requirementTypeId, {
    status: input.status,
    submittedDate,
    remarks: input.remarks,
    updatedById: actor.userId,
  });

  await recordAudit(actor, {
    action: AUDIT_ACTIONS.REQUIREMENT_UPDATED,
    entityType: "student",
    entityId: studentId,
    description: `Marked "${type.name}" as ${STATUS_LABELS[input.status]} for ${student.studentNumber} ${fullName(student)}`,
    metadata: { requirementTypeId, status: input.status, remarks: input.remarks },
  });

  return getStudentChecklist(studentId);
}

// --- Requirements page: completeness across students -----------------------------

export async function listCompliance(query: ComplianceQuery) {
  const { page, pageSize } = query;
  const types = await requirementRepository.findRequirementTypes({ activeOnly: true });
  const words = query.search?.split(/\s+/).filter(Boolean).slice(0, 5) ?? [];

  const allVerified: Prisma.StudentWhereInput = { AND: types.map((type) => requirementRepository.hasRequirementStatus(type.id, "VERIFIED")) };

  const conditions: Prisma.StudentWhereInput[] = [{ status: { not: "ARCHIVED" } }];
  if (query.programId) conditions.push({ programId: query.programId });
  if (words.length) {
    conditions.push(
      ...words.map((word) => ({
        OR: [{ studentNumber: { contains: word } }, { firstName: { contains: word } }, { lastName: { contains: word } }],
      })),
    );
  }
  if (query.completion === "complete") conditions.push(allVerified);
  if (query.completion === "incomplete") conditions.push({ NOT: allVerified });
  if (query.requirementTypeId && query.status) conditions.push(requirementRepository.hasRequirementStatus(query.requirementTypeId, query.status));

  const { items, total } = await requirementRepository.findStudentsForCompliance({ where: { AND: conditions }, ...toSkipTake({ page, pageSize }) });

  return {
    types: types.map(toTypeDto),
    items: items.map((student) => {
      const statuses = Object.fromEntries(
        types.map((type) => [type.id, student.requirements.find((row) => row.requirementTypeId === type.id)?.status ?? "PENDING"]),
      ) as Record<number, RequirementStatus>;
      const verified = Object.values(statuses).filter((status) => status === "VERIFIED").length;
      return { student: toStudentSummaryDto(student), statuses, verified, total: types.length, complete: types.length > 0 && verified === types.length };
    }),
    meta: buildPaginationMeta({ page, pageSize }, total),
  };
}
