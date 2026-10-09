import type { Request, Response } from "express";
import { roleHasPermission } from "../config/permissions";
import * as gradeService from "../services/grades/grade.service";
import { getAuth, getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import { classSelectorSchema, createGradeSchema, listClassesQuerySchema, listGradesQuerySchema, returnClassGradesSchema, saveClassGradesSchema, updateGradeSchema } from "../validators/grade.validators";

export async function list(req: Request, res: Response) {
  const result = await gradeService.listGrades(parseInput(listGradesQuerySchema, req.query));
  sendSuccess(res, result.items, { meta: result.meta });
}

export async function listClasses(req: Request, res: Response) {
  sendSuccess(res, await gradeService.listClasses(parseInput(listClassesQuerySchema, req.query)));
}

export async function roster(req: Request, res: Response) {
  sendSuccess(res, await gradeService.getClassRoster(parseInput(classSelectorSchema, req.query)));
}

export async function create(req: Request, res: Response) {
  sendCreated(res, await gradeService.createGrade(parseInput(createGradeSchema, req.body), getActor(req)), "Grade saved as draft.");
}

export async function saveClass(req: Request, res: Response) {
  const result = await gradeService.saveClassGrades(parseInput(saveClassGradesSchema, req.body), getActor(req));
  sendSuccess(res, result, { message: `Saved: ${result.created} new, ${result.updated} changed.` });
}

export async function update(req: Request, res: Response) {
  const input = parseInput(updateGradeSchema, req.body);
  const canEditPublished = roleHasPermission(getAuth(req).user.role, "grades:edit-published");
  sendSuccess(res, await gradeService.updateGrade(parseId(req.params.id), input, getActor(req), canEditPublished), { message: "Grade updated." });
}

export async function history(req: Request, res: Response) {
  sendSuccess(res, await gradeService.getGradeHistory(parseId(req.params.id)));
}

export async function publish(req: Request, res: Response) {
  sendSuccess(res, await gradeService.publishGrade(parseId(req.params.id), getActor(req)), { message: "Grade published." });
}

export async function returnClass(req: Request, res: Response) {
  const { note, ...selector } = parseInput(returnClassGradesSchema, req.body);
  sendSuccess(res, await gradeService.returnClassGrades(selector, note, getActor(req)), { message: "Returned to the teacher." });
}

export async function pendingSubmissions(_req: Request, res: Response) {
  sendSuccess(res, await gradeService.listPendingSubmissions());
}

export async function publishClass(req: Request, res: Response) {
  const result = await gradeService.publishClassGrades(parseInput(classSelectorSchema, req.body), getActor(req));
  sendSuccess(res, result, { message: `${result.published} grade(s) published. Students can now see them.` });
}
