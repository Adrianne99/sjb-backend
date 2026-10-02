// Audit logs, system settings and reports.
import type { Request, Response } from "express";
import { z } from "zod";
import { listAuditLogs } from "../services/audit/audit.service";
import * as reportService from "../services/reports/report.service";
import * as settingsService from "../services/settings/settings.service";
import { fromDateOnlyString } from "../utils/dates";
import { paginationQuerySchema } from "../utils/pagination";
import { getActor, getAuth } from "../utils/request";
import { sendSuccess } from "../utils/response";
import { parseInput } from "../utils/validate";
import { dateOnly, optionalId, searchQuery } from "../validators/common.validators";
import { collectionsQuerySchema, outstandingQuerySchema, termQuerySchema } from "../validators/report.validators";
import { gradingConfigSchema, gradingLevelQuerySchema, studentEditableFieldsSchema } from "../validators/settings.validators";

// --- Audit logs --------------------------------------------------------------

const auditQuerySchema = paginationQuerySchema.extend({
  search: searchQuery,
  action: z.string().trim().max(60).optional().transform((value) => value || undefined),
  entityType: z.string().trim().max(60).optional().transform((value) => value || undefined),
  userId: optionalId,
  dateFrom: dateOnly("From date").optional(),
  dateTo: dateOnly("To date").optional(),
});

export async function auditLogs(req: Request, res: Response) {
  const { page, pageSize, dateFrom, dateTo, ...filters } = parseInput(auditQuerySchema, req.query);
  const dayAfter = (value: string) => new Date(fromDateOnlyString(value).getTime() + 24 * 60 * 60 * 1000);
  const result = await listAuditLogs(
    { ...filters, dateFrom: dateFrom ? fromDateOnlyString(dateFrom) : undefined, dateTo: dateTo ? dayAfter(dateTo) : undefined },
    { page, pageSize },
  );
  sendSuccess(res, result.items, { meta: result.meta });
}

// --- Settings ----------------------------------------------------------------

export async function getSettings(_req: Request, res: Response) {
  sendSuccess(res, await settingsService.getAllSettings());
}

/** Read-only grading scale — any logged-in user. ?level=Senior High School for a level's scale. */
export async function getGradingConfig(req: Request, res: Response) {
  const { level } = parseInput(gradingLevelQuerySchema, req.query);
  sendSuccess(res, await settingsService.getGradingConfig(level));
}

/** Saves the default scale, or a level's scale with ?level=. */
export async function updateGrading(req: Request, res: Response) {
  const { level } = parseInput(gradingLevelQuerySchema, req.query);
  const config = parseInput(gradingConfigSchema, req.body);
  sendSuccess(res, await settingsService.updateGradingConfig(config, getActor(req), level), { message: "Grading scale saved." });
}

/** ?level= goes back to using the default scale. */
export async function removeGradingLevel(req: Request, res: Response) {
  const { level } = parseInput(gradingLevelQuerySchema, req.query);
  if (!level) return sendSuccess(res, null);
  await settingsService.removeGradingOverride(level, getActor(req));
  sendSuccess(res, null, { message: `${level} now uses the default grading scale.` });
}

export async function updateStudentEditableFields(req: Request, res: Response) {
  const { fields } = parseInput(studentEditableFieldsSchema, req.body);
  sendSuccess(res, await settingsService.updateStudentEditableFields(fields, getActor(req)), { message: "Student-editable fields saved." });
}

// --- Reports -----------------------------------------------------------------

export async function dashboard(req: Request, res: Response) {
  sendSuccess(res, await reportService.getDashboard(getAuth(req).user.role));
}

export async function enrollmentSummary(req: Request, res: Response) {
  const { semesterId } = parseInput(termQuerySchema, req.query);
  sendSuccess(res, await reportService.getEnrollmentSummary(semesterId));
}

export async function collections(req: Request, res: Response) {
  const { dateFrom, dateTo } = parseInput(collectionsQuerySchema, req.query);
  sendSuccess(res, await reportService.getCollections(dateFrom, dateTo));
}

export async function outstandingBalances(req: Request, res: Response) {
  const result = await reportService.getOutstandingBalances(parseInput(outstandingQuerySchema, req.query));
  res.json({ success: true, data: result.items, meta: result.meta, summary: result.summary });
}
