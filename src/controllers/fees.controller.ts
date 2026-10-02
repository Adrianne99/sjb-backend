import type { Request, Response } from "express";
import * as feeService from "../services/fees/fee.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import { applyFeesSchema, crossEnrollmentFeeSchema, feeScheduleSchema } from "../validators/fee.validators";

/** Public — the website's "Tuition Fee Options" table. */
export async function listPublic(_req: Request, res: Response) {
  sendSuccess(res, await feeService.listPublicFees());
}

export async function list(_req: Request, res: Response) {
  sendSuccess(res, await feeService.listFeeSchedules());
}

export async function create(req: Request, res: Response) {
  sendCreated(res, await feeService.createFeeSchedule(parseInput(feeScheduleSchema, req.body), getActor(req)), "Tuition fees added.");
}

export async function update(req: Request, res: Response) {
  const input = parseInput(feeScheduleSchema, req.body);
  sendSuccess(res, await feeService.updateFeeSchedule(parseId(req.params.id), input, getActor(req)), { message: "Tuition fees updated." });
}

export async function updateCrossEnrollmentFee(req: Request, res: Response) {
  const { amount } = parseInput(crossEnrollmentFeeSchema, req.body);
  sendSuccess(res, await feeService.updateCrossEnrollmentFee(amount, getActor(req)), { message: "Cross-enrollment fee saved." });
}

/** POST /api/enrollments/:id/apply-fees — { plan, units?, preview? } */
export async function applyToEnrollment(req: Request, res: Response) {
  const input = parseInput(applyFeesSchema, req.body);
  const result = await feeService.applyFees(parseId(req.params.id), input, getActor(req));
  sendSuccess(res, result, { message: input.preview ? undefined : "Tuition fees applied." });
}
