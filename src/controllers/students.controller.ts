import type { Request, Response } from "express";
import { getAcademicHistory } from "../services/grades/report-card.service";
import { getStudentStatement } from "../services/payments/balance.service";
import { listStudentPayments } from "../services/payments/payment.service";
import * as accountService from "../services/students/student-account.service";
import * as studentService from "../services/students/student.service";
import { getActor, getAuth } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import {
  accountStatusSchema,
  createAccountSchema,
  createStudentSchema,
  listStudentsQuerySchema,
  updateStudentSchema,
} from "../validators/student.validators";

export async function list(req: Request, res: Response) {
  const result = await studentService.listStudents(parseInput(listStudentsQuerySchema, req.query));
  res.json({ success: true, data: result.items, meta: result.meta, currentTerm: result.currentTerm });
}

export async function getById(req: Request, res: Response) {
  sendSuccess(res, await studentService.getStudentDetail(parseId(req.params.id), getAuth(req).user));
}

export async function create(req: Request, res: Response) {
  const result = await studentService.createStudent(parseInput(createStudentSchema, req.body), getActor(req));
  sendCreated(res, result, "Student record created.");
}

export async function update(req: Request, res: Response) {
  const input = parseInput(updateStudentSchema, req.body);
  sendSuccess(res, await studentService.updateStudent(parseId(req.params.id), input, getActor(req)), { message: "Student record updated." });
}

export async function archive(req: Request, res: Response) {
  sendSuccess(res, await studentService.archiveStudent(parseId(req.params.id), getActor(req)), { message: "Student archived." });
}

export async function restore(req: Request, res: Response) {
  sendSuccess(res, await studentService.restoreStudent(parseId(req.params.id), getActor(req)), { message: "Student restored." });
}

// --- Related records (staff view: includes draft grades) ----------------------

export async function grades(req: Request, res: Response) {
  sendSuccess(res, await getAcademicHistory(parseId(req.params.id), { publishedOnly: false }));
}

export async function balance(req: Request, res: Response) {
  sendSuccess(res, await getStudentStatement(parseId(req.params.id)));
}

export async function payments(req: Request, res: Response) {
  sendSuccess(res, await listStudentPayments(parseId(req.params.id)));
}

// --- Portal account ----------------------------------------------------------

export async function createAccount(req: Request, res: Response) {
  const input = parseInput(createAccountSchema, req.body ?? {});
  const credentials = await accountService.createStudentAccount(parseId(req.params.id), input, getActor(req));
  sendCreated(res, credentials, "Portal account created. Give the temporary password to the student — it will not be shown again.");
}

export async function resetPassword(req: Request, res: Response) {
  const credentials = await accountService.resetStudentPassword(parseId(req.params.id), getActor(req));
  sendSuccess(res, credentials, { message: "A new temporary password was issued. It will not be shown again." });
}

export async function setAccountStatus(req: Request, res: Response) {
  const { isActive } = parseInput(accountStatusSchema, req.body);
  await accountService.setStudentAccountActive(parseId(req.params.id), isActive, getActor(req));
  sendSuccess(res, { isActive }, { message: isActive ? "Account activated." : "Account deactivated." });
}
