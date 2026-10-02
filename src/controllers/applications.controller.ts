import type { Request, Response } from "express";
import * as applicationService from "../services/applications/application.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import { applicationSchema, convertApplicationSchema, listApplicationsQuerySchema, rejectApplicationSchema } from "../validators/application.validators";

/** Public — programs, year levels and documents for the "Enroll Now" form. */
export async function formOptions(_req: Request, res: Response) {
  sendSuccess(res, await applicationService.getApplicationFormOptions());
}

/** Public — submit the online pre-registration. */
export async function submit(req: Request, res: Response) {
  const input = parseInput(applicationSchema, req.body);
  sendCreated(res, await applicationService.submitApplication(input, getActor(req).ipAddress), "Application received.");
}

export async function list(req: Request, res: Response) {
  const result = await applicationService.listApplications(parseInput(listApplicationsQuerySchema, req.query));
  res.json({ success: true, data: result.items, meta: result.meta });
}

export async function get(req: Request, res: Response) {
  sendSuccess(res, await applicationService.getApplication(parseId(req.params.id)));
}

export async function convert(req: Request, res: Response) {
  const input = parseInput(convertApplicationSchema, req.body);
  sendSuccess(res, await applicationService.convertApplication(parseId(req.params.id), input, getActor(req)), { message: "Student record created." });
}

export async function reject(req: Request, res: Response) {
  const { remarks } = parseInput(rejectApplicationSchema, req.body);
  sendSuccess(res, await applicationService.rejectApplication(parseId(req.params.id), remarks, getActor(req)), { message: "Application rejected." });
}
