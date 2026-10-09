import type { Request, Response } from "express";
import * as academicService from "../services/academic/academic.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import * as V from "../validators/academic.validators";

export async function getCurrentTerm(_req: Request, res: Response) {
  sendSuccess(res, await academicService.getCurrentTerm());
}

export async function setCurrentSemester(req: Request, res: Response) {
  const semester = await academicService.setCurrentSemester(parseId(req.params.id), getActor(req));
  sendSuccess(res, semester, { message: `${semester.label} is now the current term.` });
}

// Programs
export async function listPrograms(_req: Request, res: Response) {
  sendSuccess(res, await academicService.listPrograms());
}
export async function createProgram(req: Request, res: Response) {
  sendCreated(res, await academicService.createProgram(parseInput(V.programSchema, req.body), getActor(req)), "Program created.");
}
export async function updateProgram(req: Request, res: Response) {
  const input = parseInput(V.programSchema, req.body);
  sendSuccess(res, await academicService.updateProgram(parseId(req.params.id), input, getActor(req)), { message: "Program updated." });
}

// Academic years & semesters
export async function listAcademicYears(_req: Request, res: Response) {
  sendSuccess(res, await academicService.listAcademicYears());
}
export async function createAcademicYear(req: Request, res: Response) {
  const input = parseInput(V.academicYearSchema, req.body);
  sendCreated(res, await academicService.createAcademicYear(input, getActor(req)), "Academic year created.");
}
export async function updateAcademicYear(req: Request, res: Response) {
  const input = parseInput(V.academicYearSchema, req.body);
  sendSuccess(res, await academicService.updateAcademicYear(parseId(req.params.id), input, getActor(req)), { message: "Academic year updated." });
}
export async function createSemester(req: Request, res: Response) {
  const input = parseInput(V.semesterSchema, req.body);
  sendCreated(res, await academicService.createSemester(input, getActor(req)), "Term created.");
}
export async function updateSemester(req: Request, res: Response) {
  const input = parseInput(V.semesterSchema, req.body);
  sendSuccess(res, await academicService.updateSemester(parseId(req.params.id), input, getActor(req)), { message: "Term updated." });
}

// Sections
export async function listSections(req: Request, res: Response) {
  sendSuccess(res, await academicService.listSections(parseInput(V.sectionFiltersSchema, req.query)));
}
export async function createSection(req: Request, res: Response) {
  sendCreated(res, await academicService.createSection(parseInput(V.sectionSchema, req.body), getActor(req)), "Section created.");
}
export async function deleteSection(req: Request, res: Response) {
  await academicService.deleteSection(parseId(req.params.id), getActor(req));
  sendSuccess(res, null, { message: "Section deleted." });
}
export async function updateSection(req: Request, res: Response) {
  const input = parseInput(V.sectionSchema, req.body);
  sendSuccess(res, await academicService.updateSection(parseId(req.params.id), input, getActor(req)), { message: "Section updated." });
}

// Subjects
export async function listSubjects(_req: Request, res: Response) {
  sendSuccess(res, await academicService.listSubjects());
}
export async function createSubject(req: Request, res: Response) {
  sendCreated(res, await academicService.createSubject(parseInput(V.subjectSchema, req.body), getActor(req)), "Subject created.");
}
export async function updateSubject(req: Request, res: Response) {
  const input = parseInput(V.subjectSchema, req.body);
  sendSuccess(res, await academicService.updateSubject(parseId(req.params.id), input, getActor(req)), { message: "Subject updated." });
}

// Instructors
export async function listInstructors(_req: Request, res: Response) {
  sendSuccess(res, await academicService.listInstructors());
}
export async function createInstructor(req: Request, res: Response) {
  sendCreated(res, await academicService.createInstructor(parseInput(V.instructorSchema, req.body), getActor(req)), "Instructor created.");
}
export async function updateInstructor(req: Request, res: Response) {
  const input = parseInput(V.instructorSchema, req.body);
  sendSuccess(res, await academicService.updateInstructor(parseId(req.params.id), input, getActor(req)), { message: "Instructor updated." });
}

// Rooms
export async function listRooms(_req: Request, res: Response) {
  sendSuccess(res, await academicService.listRooms());
}
export async function createRoom(req: Request, res: Response) {
  sendCreated(res, await academicService.createRoom(parseInput(V.roomSchema, req.body), getActor(req)), "Room created.");
}
export async function updateRoom(req: Request, res: Response) {
  const input = parseInput(V.roomSchema, req.body);
  sendSuccess(res, await academicService.updateRoom(parseId(req.params.id), input, getActor(req)), { message: "Room updated." });
}
