import type { Request, Response } from "express";
import * as scheduleService from "../services/schedules/schedule.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import { listSchedulesQuerySchema, scheduleSchema } from "../validators/schedule.validators";

export async function list(req: Request, res: Response) {
  sendSuccess(res, await scheduleService.listSchedules(parseInput(listSchedulesQuerySchema, req.query)));
}

export async function create(req: Request, res: Response) {
  sendCreated(res, await scheduleService.createSchedule(parseInput(scheduleSchema, req.body), getActor(req)), "Schedule created.");
}

export async function update(req: Request, res: Response) {
  const input = parseInput(scheduleSchema, req.body);
  sendSuccess(res, await scheduleService.updateSchedule(parseId(req.params.id), input, getActor(req)), { message: "Schedule updated." });
}

export async function remove(req: Request, res: Response) {
  await scheduleService.deleteSchedule(parseId(req.params.id), getActor(req));
  sendSuccess(res, null, { message: "Schedule removed." });
}
