// /api/teaching — the logged-in teacher's own classes. The teacher is always
// taken from the session; the browser never says which instructor it is.
import type { Request, Response } from "express";
import * as teachingService from "../services/teaching/teaching.service";
import { getActor, getAuth } from "../utils/request";
import { sendSuccess } from "../utils/response";
import { parseInput } from "../utils/validate";
import { attendanceQuerySchema, classSelectorSchema, listClassesQuerySchema, saveAttendanceSchema, saveClassGradesSchema } from "../validators/grade.validators";

export async function schedule(req: Request, res: Response) {
  const { semesterId } = parseInput(listClassesQuerySchema, req.query);
  sendSuccess(res, await teachingService.getMySchedule(getAuth(req).user.id, semesterId));
}

export async function classes(req: Request, res: Response) {
  const { semesterId } = parseInput(listClassesQuerySchema, req.query);
  sendSuccess(res, await teachingService.listMyClasses(getAuth(req).user.id, semesterId));
}

export async function roster(req: Request, res: Response) {
  sendSuccess(res, await teachingService.getMyClassRoster(getAuth(req).user.id, parseInput(classSelectorSchema, req.query)));
}

export async function saveGrades(req: Request, res: Response) {
  const result = await teachingService.saveMyClassGrades(getAuth(req).user.id, parseInput(saveClassGradesSchema, req.body), getActor(req));
  sendSuccess(res, result, { message: `Saved as drafts: ${result.created} new, ${result.updated} changed.` });
}

export async function submitGrades(req: Request, res: Response) {
  const submission = await teachingService.submitMyClassGrades(getAuth(req).user.id, parseInput(classSelectorSchema, req.body), getActor(req));
  sendSuccess(res, submission, { message: "Submitted for review. The Registrar's Office will publish the grades or return them to you." });
}

export async function attendanceSheet(req: Request, res: Response) {
  const { date, ...selector } = parseInput(attendanceQuerySchema, req.query);
  sendSuccess(res, await teachingService.getMyAttendanceSheet(getAuth(req).user.id, selector, date));
}

export async function saveAttendance(req: Request, res: Response) {
  const { date, entries, ...selector } = parseInput(saveAttendanceSchema, req.body);
  const sheet = await teachingService.saveMyAttendance(getAuth(req).user.id, selector, date, entries, getActor(req));
  sendSuccess(res, sheet, { message: "Attendance saved." });
}

export async function attendanceSummary(req: Request, res: Response) {
  sendSuccess(res, await teachingService.getMyAttendanceSummary(getAuth(req).user.id, parseInput(classSelectorSchema, req.query)));
}

export async function announcements(_req: Request, res: Response) {
  sendSuccess(res, await teachingService.listMyAnnouncements());
}
