import type { Request, Response } from "express";
import * as enrollmentService from "../services/enrollment/enrollment.service";
import * as extraSubjectService from "../services/enrollment/extra-subject.service";
import { getReportCardForEnrollment } from "../services/grades/report-card.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import {
  assessmentItemSchema,
  tuitionUnitsSchema,
  createEnrollmentSchema,
  extraSubjectSchema,
  listEnrollmentsQuerySchema,
  updateEnrollmentSchema,
} from "../validators/enrollment.validators";
import { queryBoolean } from "../validators/common.validators";

export async function list(req: Request, res: Response) {
  const result = await enrollmentService.listEnrollments(parseInput(listEnrollmentsQuerySchema, req.query));
  sendSuccess(res, result.items, { meta: result.meta });
}

export async function getById(req: Request, res: Response) {
  sendSuccess(res, await enrollmentService.getEnrollment(parseId(req.params.id)));
}

export async function create(req: Request, res: Response) {
  const enrollment = await enrollmentService.createEnrollment(parseInput(createEnrollmentSchema, req.body), getActor(req));
  sendCreated(res, enrollment, "Enrollment saved.");
}

export async function update(req: Request, res: Response) {
  const input = parseInput(updateEnrollmentSchema, req.body);
  sendSuccess(res, await enrollmentService.updateEnrollment(parseId(req.params.id), input, getActor(req)), { message: "Enrollment updated." });
}

export async function addAssessment(req: Request, res: Response) {
  const input = parseInput(assessmentItemSchema, req.body);
  sendCreated(res, await enrollmentService.addAssessment(parseId(req.params.id), input, getActor(req)), "Charge added.");
}

export async function updateAssessment(req: Request, res: Response) {
  const input = parseInput(assessmentItemSchema, req.body);
  sendSuccess(res, await enrollmentService.updateAssessment(parseId(req.params.assessmentId), input, getActor(req)), { message: "Charge updated." });
}

export async function updateTuitionUnits(req: Request, res: Response) {
  const { units } = parseInput(tuitionUnitsSchema, req.body);
  sendSuccess(res, await enrollmentService.updateTuitionUnits(parseId(req.params.assessmentId), units, getActor(req)), { message: "Tuition updated." });
}

/** Printable report card. ?includeDrafts=true shows unpublished grades (staff preview). */
export async function reportCard(req: Request, res: Response) {
  const includeDrafts = parseInput(queryBoolean, req.query.includeDrafts) ?? false;
  sendSuccess(res, await getReportCardForEnrollment(parseId(req.params.id), { publishedOnly: !includeDrafts }));
}

// --- Irregular students: extra subjects from other sections -------------------

export async function listExtraSubjects(req: Request, res: Response) {
  sendSuccess(res, await extraSubjectService.listExtraSubjects(parseId(req.params.id)));
}

export async function availableClasses(req: Request, res: Response) {
  sendSuccess(res, await extraSubjectService.listAvailableClasses(parseId(req.params.id)));
}

export async function addExtraSubject(req: Request, res: Response) {
  const input = parseInput(extraSubjectSchema, req.body);
  sendCreated(res, await extraSubjectService.addExtraSubject(parseId(req.params.id), input, getActor(req)), "Subject added to the student's schedule.");
}

export async function removeExtraSubject(req: Request, res: Response) {
  const result = await extraSubjectService.removeExtraSubject(parseId(req.params.id), parseId(req.params.extraId, "extraId"), getActor(req));
  sendSuccess(res, result, { message: "Subject removed from the student's schedule." });
}
