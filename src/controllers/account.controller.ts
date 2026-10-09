// /api/account — the logged-in office user's own account (always from the session).
import type { Request, Response } from "express";
import * as accountService from "../services/account/account.service";
import { getActor, getAuth } from "../utils/request";
import { sendSuccess } from "../utils/response";
import { parseInput } from "../utils/validate";
import { accountNotificationsSchema, accountProfileSchema } from "../validators/account.validators";

export async function get(req: Request, res: Response) {
  sendSuccess(res, await accountService.getMyAccount(getAuth(req).user.id));
}

export async function updateProfile(req: Request, res: Response) {
  const input = parseInput(accountProfileSchema, req.body);
  sendSuccess(res, await accountService.updateMyProfile(getAuth(req).user.id, input, getActor(req)), { message: "Your details were saved." });
}

export async function updateNotifications(req: Request, res: Response) {
  const input = parseInput(accountNotificationsSchema, req.body);
  sendSuccess(res, await accountService.updateMyNotifications(getAuth(req).user.id, input), { message: "Email settings saved." });
}
