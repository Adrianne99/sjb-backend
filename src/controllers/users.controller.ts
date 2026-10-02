import type { Request, Response } from "express";
import * as userService from "../services/users/user.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import { createStaffUserSchema, listUsersQuerySchema, updateUserSchema } from "../validators/user.validators";

export async function list(req: Request, res: Response) {
  const result = await userService.listUsers(parseInput(listUsersQuerySchema, req.query));
  sendSuccess(res, result.items, { meta: result.meta });
}

export async function getById(req: Request, res: Response) {
  sendSuccess(res, await userService.getUser(parseId(req.params.id)));
}

export async function create(req: Request, res: Response) {
  const result = await userService.createStaffUser(parseInput(createStaffUserSchema, req.body), getActor(req));
  sendCreated(res, result, "Account created. Give the temporary password to the user — it will not be shown again.");
}

export async function update(req: Request, res: Response) {
  const input = parseInput(updateUserSchema, req.body);
  sendSuccess(res, await userService.updateUser(parseId(req.params.id), input, getActor(req)), { message: "Account updated." });
}

export async function resetPassword(req: Request, res: Response) {
  const credentials = await userService.resetUserPassword(parseId(req.params.id), getActor(req));
  sendSuccess(res, credentials, { message: "A new temporary password was issued. It will not be shown again." });
}
