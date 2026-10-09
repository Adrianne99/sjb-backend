// Academic setup: programs, academic years/terms, sections, subjects,
// instructors and rooms. Every create/update is audited.
import { prisma } from "../../config/database";
import * as mapper from "../../mappers/academic.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { fromDateOnlyString } from "../../utils/dates";
import type * as V from "../../validators/academic.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { assertYearLevel } from "../../utils/year-levels";

function auditCreate(actor: Actor, entityType: string, entityId: number, label: string) {
  return recordAudit(actor, {
    action: AUDIT_ACTIONS.ACADEMIC_RECORD_CREATED,
    entityType,
    entityId,
    description: `Created ${entityType.replace("_", " ")} ${label}`,
  });
}

function auditUpdate(actor: Actor, entityType: string, entityId: number, label: string) {
  return recordAudit(actor, {
    action: AUDIT_ACTIONS.ACADEMIC_RECORD_UPDATED,
    entityType,
    entityId,
    description: `Updated ${entityType.replace("_", " ")} ${label}`,
  });
}

async function mustExist<T>(promise: Promise<T | null>, message: string): Promise<T> {
  const record = await promise;
  if (!record) throw AppError.notFound(message);
  return record;
}

const optionalDate = (value: string | null | undefined) => (value ? fromDateOnlyString(value) : null);

// --- Current term ------------------------------------------------------------

export async function getCurrentTerm() {
  const semester = await academicRepository.findCurrentSemester();
  return semester ? mapper.toSemesterDto(semester) : null;
}

export async function setCurrentSemester(id: number, actor: Actor) {
  await mustExist(academicRepository.findSemesterById(id), "Term not found.");
  const semester = await prisma.$transaction(async (tx) => {
    await academicRepository.clearCurrentSemester(tx);
    return academicRepository.updateSemester(id, { isCurrent: true }, tx);
  });
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: "semester",
    entityId: id,
    description: `Set current term to ${semester.name}, ${semester.academicYear.name}`,
  });
  return mapper.toSemesterDto(semester);
}

// --- Programs ----------------------------------------------------------------

export async function listPrograms() {
  return (await academicRepository.findPrograms()).map(mapper.toProgramDto);
}

export async function createProgram(input: V.ProgramInput, actor: Actor) {
  const program = await academicRepository.createProgram(input);
  await auditCreate(actor, "program", program.id, program.code);
  return mapper.toProgramDto(program);
}

export async function updateProgram(id: number, input: V.ProgramInput, actor: Actor) {
  await mustExist(academicRepository.findProgramById(id), "Program not found.");
  const program = await academicRepository.updateProgram(id, input);
  await auditUpdate(actor, "program", id, program.code);
  return mapper.toProgramDto(program);
}

// --- Academic years & semesters ----------------------------------------------

export async function listAcademicYears() {
  return (await academicRepository.findAcademicYears()).map(mapper.toAcademicYearDto);
}

export async function createAcademicYear(input: V.AcademicYearInput, actor: Actor) {
  const year = await academicRepository.createAcademicYear({
    name: input.name,
    startDate: fromDateOnlyString(input.startDate),
    endDate: fromDateOnlyString(input.endDate),
  });
  await auditCreate(actor, "academic_year", year.id, year.name);
  return mapper.toAcademicYearDto(year);
}

export async function updateAcademicYear(id: number, input: V.AcademicYearInput, actor: Actor) {
  await mustExist(academicRepository.findAcademicYearById(id), "Academic year not found.");
  const year = await academicRepository.updateAcademicYear(id, {
    name: input.name,
    startDate: fromDateOnlyString(input.startDate),
    endDate: fromDateOnlyString(input.endDate),
  });
  await auditUpdate(actor, "academic_year", id, year.name);
  return mapper.toAcademicYearDto(year);
}

export async function createSemester(input: V.SemesterInput, actor: Actor) {
  await mustExist(academicRepository.findAcademicYearById(input.academicYearId), "Academic year not found.");
  const semester = await academicRepository.createSemester({
    academicYearId: input.academicYearId,
    name: input.name,
    termNumber: input.termNumber,
    startDate: optionalDate(input.startDate),
    endDate: optionalDate(input.endDate),
  });
  await auditCreate(actor, "semester", semester.id, `${semester.name}, ${semester.academicYear.name}`);
  return mapper.toSemesterDto(semester);
}

export async function updateSemester(id: number, input: V.SemesterInput, actor: Actor) {
  await mustExist(academicRepository.findSemesterById(id), "Term not found.");
  const semester = await academicRepository.updateSemester(id, {
    academicYearId: input.academicYearId,
    name: input.name,
    termNumber: input.termNumber,
    startDate: optionalDate(input.startDate),
    endDate: optionalDate(input.endDate),
  });
  await auditUpdate(actor, "semester", id, `${semester.name}, ${semester.academicYear.name}`);
  return mapper.toSemesterDto(semester);
}

// --- Sections ----------------------------------------------------------------

export async function listSections(filters: academicRepository.SectionFilters) {
  return (await academicRepository.findSections(filters)).map(mapper.toSectionDto);
}

async function checkSectionReferences(input: V.SectionInput) {
  const program = await mustExist(academicRepository.findProgramById(input.programId), "Program not found.");
  assertYearLevel(program, input.yearLevel);
  await mustExist(academicRepository.findAcademicYearById(input.academicYearId), "Academic year not found.");
}

export async function createSection(input: V.SectionInput, actor: Actor) {
  await checkSectionReferences(input);
  const section = await academicRepository.createSection(input);
  await auditCreate(actor, "section", section.id, section.name);
  return mapper.toSectionDto(section);
}

export async function updateSection(id: number, input: V.SectionInput, actor: Actor) {
  await mustExist(academicRepository.findSectionById(id), "Section not found.");
  await checkSectionReferences(input);
  const section = await academicRepository.updateSection(id, input);
  await auditUpdate(actor, "section", id, section.name);
  return mapper.toSectionDto(section);
}

/**
 * Removes a section that was added by mistake or is no longer needed.
 * Refused while anything still uses it (students, schedules, grades, attendance),
 * so no record is ever left pointing to a missing section.
 */
export async function deleteSection(id: number, actor: Actor) {
  const section = await mustExist(academicRepository.findSectionById(id), "Section not found.");
  const usage = await academicRepository.countSectionUsage(id);
  const reasons = [
    usage.enrollments && `${usage.enrollments} enrollment record(s)`,
    usage.schedules && `${usage.schedules} class schedule(s)`,
    usage.irregularStudents && `${usage.irregularStudents} irregular student subject(s)`,
    usage.gradeSubmissions && `${usage.gradeSubmissions} submitted grade sheet(s)`,
    usage.attendance && `${usage.attendance} attendance record(s)`,
  ].filter(Boolean);
  if (reasons.length) {
    throw AppError.conflict(
      `${section.name} can't be removed because it is still used by ${reasons.join(", ")}. Move or remove those first — or keep the section for the school's records.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await academicRepository.deleteSection(id, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.ACADEMIC_RECORD_DELETED,
        entityType: "section",
        entityId: id,
        description: `Deleted section ${section.name} (${section.academicYear.name})`,
      },
      tx,
    );
  });
}

// --- Subjects ----------------------------------------------------------------

export async function listSubjects() {
  return (await academicRepository.findSubjects()).map(mapper.toSubjectDto);
}

export async function createSubject(input: V.SubjectInput, actor: Actor) {
  const subject = await academicRepository.createSubject(input);
  await auditCreate(actor, "subject", subject.id, subject.code);
  return mapper.toSubjectDto(subject);
}

export async function updateSubject(id: number, input: V.SubjectInput, actor: Actor) {
  await mustExist(academicRepository.findSubjectById(id), "Subject not found.");
  const subject = await academicRepository.updateSubject(id, input);
  await auditUpdate(actor, "subject", id, subject.code);
  return mapper.toSubjectDto(subject);
}

// --- Instructors -------------------------------------------------------------

export async function listInstructors() {
  return (await academicRepository.findInstructors()).map(mapper.toInstructorDto);
}

export async function createInstructor(input: V.InstructorInput, actor: Actor) {
  const instructor = await academicRepository.createInstructor(input);
  await auditCreate(actor, "instructor", instructor.id, `${instructor.firstName} ${instructor.lastName}`);
  return mapper.toInstructorDto(instructor);
}

export async function updateInstructor(id: number, input: V.InstructorInput, actor: Actor) {
  await mustExist(academicRepository.findInstructorById(id), "Instructor not found.");
  const instructor = await academicRepository.updateInstructor(id, input);
  await auditUpdate(actor, "instructor", id, `${instructor.firstName} ${instructor.lastName}`);
  return mapper.toInstructorDto(instructor);
}

// --- Rooms -------------------------------------------------------------------

export async function listRooms() {
  return (await academicRepository.findRooms()).map(mapper.toRoomDto);
}

export async function createRoom(input: V.RoomInput, actor: Actor) {
  const room = await academicRepository.createRoom(input);
  await auditCreate(actor, "room", room.id, room.code);
  return mapper.toRoomDto(room);
}

export async function updateRoom(id: number, input: V.RoomInput, actor: Actor) {
  await mustExist(academicRepository.findRoomById(id), "Room not found.");
  const room = await academicRepository.updateRoom(id, input);
  await auditUpdate(actor, "room", id, room.code);
  return mapper.toRoomDto(room);
}
