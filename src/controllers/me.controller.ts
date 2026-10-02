// /api/me/* — the student's own records. The student ID always comes from the
// session (getOwnStudentId), never from the request, so students cannot ask
// for someone else's data.
import type { Request, Response } from "express";
import { z } from "zod";
import { listStudentAnnouncements } from "../services/announcements/announcement.service";
import { getAcademicHistory, getStudentReportCard } from "../services/grades/report-card.service";
import * as portal from "../services/me/student-portal.service";
import { getActor, getAuth, getOwnStudentId } from "../utils/request";
import { sendSuccess } from "../utils/response";
import { parseInput } from "../utils/validate";
import { optionalId } from "../validators/common.validators";
import { studentProfileSchema } from "../validators/student.validators";

const termQuery = z.object({ semesterId: optionalId });
const preferencesSchema = z.object({
  notifyAnnouncements: z.boolean(),
  notifyAccountActivity: z.boolean(),
  /** Enrollment, payment and grade emails. Optional so older clients keep working. */
  notifySchoolRecords: z.boolean().optional(),
});

export async function overview(req: Request, res: Response) {
  sendSuccess(res, await portal.getOverview(getOwnStudentId(req)));
}

export async function profile(req: Request, res: Response) {
  sendSuccess(res, await portal.getProfile(getOwnStudentId(req)));
}

export async function updateProfile(req: Request, res: Response) {
  // .partial() — the student sends only the fields they are changing.
  // .strict() — unknown keys (e.g. "firstName") are rejected, not ignored.
  const input = parseInput(studentProfileSchema.partial().strict(), req.body);
  sendSuccess(res, await portal.updateProfile(getOwnStudentId(req), input, getActor(req)), { message: "Your details were updated." });
}

export async function grades(req: Request, res: Response) {
  sendSuccess(res, await getAcademicHistory(getOwnStudentId(req), { publishedOnly: true }));
}

export async function reportCard(req: Request, res: Response) {
  const { semesterId } = parseInput(termQuery, req.query);
  sendSuccess(res, await getStudentReportCard(getOwnStudentId(req), semesterId));
}

export async function schedule(req: Request, res: Response) {
  const { semesterId } = parseInput(termQuery, req.query);
  sendSuccess(res, await portal.getSchedule(getOwnStudentId(req), semesterId));
}

export async function balance(req: Request, res: Response) {
  sendSuccess(res, await portal.getBalance(getOwnStudentId(req)));
}

export async function paymentHistory(req: Request, res: Response) {
  sendSuccess(res, await portal.getPaymentHistory(getOwnStudentId(req)));
}

export async function announcements(_req: Request, res: Response) {
  sendSuccess(res, await listStudentAnnouncements(20));
}

export async function preferences(req: Request, res: Response) {
  sendSuccess(res, await portal.getNotificationPreferences(getAuth(req).user.id));
}

export async function updatePreferences(req: Request, res: Response) {
  const input = parseInput(preferencesSchema, req.body);
  sendSuccess(res, await portal.updateNotificationPreferences(getAuth(req).user.id, input), { message: "Preferences saved." });
}
