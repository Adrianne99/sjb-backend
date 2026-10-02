import type { Request, Response } from "express";
import * as requirementService from "../services/requirements/requirement.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import { complianceQuerySchema, requirementTypeSchema, studentRequirementSchema } from "../validators/requirement.validators";

/** Public — the landing page's "Admission requirements" list. */
export async function listPublic(_req: Request, res: Response) {
  sendSuccess(res, await requirementService.listPublicRequirements());
}

export async function listTypes(_req: Request, res: Response) {
  sendSuccess(res, await requirementService.listRequirementTypes());
}

export async function createType(req: Request, res: Response) {
  sendCreated(res, await requirementService.createRequirementType(parseInput(requirementTypeSchema, req.body), getActor(req)), "Requirement added.");
}

export async function updateType(req: Request, res: Response) {
  const input = parseInput(requirementTypeSchema, req.body);
  sendSuccess(res, await requirementService.updateRequirementType(parseId(req.params.id), input, getActor(req)), { message: "Requirement updated." });
}

export async function compliance(req: Request, res: Response) {
  const result = await requirementService.listCompliance(parseInput(complianceQuerySchema, req.query));
  res.json({ success: true, data: result.items, meta: result.meta, types: result.types });
}

export async function studentChecklist(req: Request, res: Response) {
  sendSuccess(res, await requirementService.getStudentChecklist(parseId(req.params.id)));
}

export async function updateStudentRequirement(req: Request, res: Response) {
  const input = parseInput(studentRequirementSchema, req.body);
  const result = await requirementService.updateStudentRequirement(parseId(req.params.id), parseId(req.params.requirementId, "requirementId"), input, getActor(req));
  sendSuccess(res, result, { message: "Requirement updated." });
}
