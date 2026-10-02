// Irregular students: extra subjects taken with ANOTHER section.
//
// Example: a 2nd-year IT student in "IT 2-A" who still needs two 1st-year
// subjects joins those classes of "IT 1-A". The classes then appear on the
// student's schedule and the student appears on those classes' grade sheets.
//
// Rules:
// - The subject must be scheduled for that section in the same term.
// - It cannot be a subject the student already takes (own section or extra).
// - Its meetings cannot overlap the student's existing schedule.
// - It cannot be removed once a grade has been encoded for it.
import { prisma } from "../../config/database";
import { toScheduleDto } from "../../mappers/schedule.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import * as enrollmentSubjectRepository from "../../repositories/enrollment-subject.repository";
import * as enrollmentRepository from "../../repositories/enrollment.repository";
import * as scheduleRepository from "../../repositories/schedule.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { isSeniorHigh } from "../../utils/year-levels";
import type { ExtraSubjectInput } from "../../validators/enrollment.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { getCrossEnrollmentFee } from "../fees/fee.service";

async function loadEnrollment(enrollmentId: number) {
  const enrollment = await enrollmentRepository.findEnrollmentById(enrollmentId);
  if (!enrollment) throw AppError.notFound("Enrollment not found.");
  return enrollment;
}

/** The student's own-section classes + extras, as schedule slots. */
async function currentSlots(enrollment: { id: number; semesterId: number; sectionId: number | null }) {
  const extras = await enrollmentSubjectRepository.findExtraSubjects(enrollment.id);
  return scheduleRepository.findSlotsForStudent(enrollment.semesterId, enrollment.sectionId, extras);
}

export async function listExtraSubjects(enrollmentId: number) {
  const enrollment = await loadEnrollment(enrollmentId);
  const [extras, grades] = await Promise.all([
    enrollmentSubjectRepository.findExtraSubjects(enrollmentId),
    prisma.grade.findMany({ where: { enrollmentId }, select: { subjectId: true } }),
  ]);
  const slots = await scheduleRepository.findSlotsForStudent(enrollment.semesterId, null, extras);

  return extras.map((extra) => ({
    id: extra.id,
    subject: { id: extra.subject.id, code: extra.subject.code, name: extra.subject.name, units: Number(extra.subject.units) },
    section: { id: extra.section.id, name: extra.section.name },
    hasGrade: grades.some((grade) => grade.subjectId === extra.subjectId),
    slots: slots.filter((slot) => slot.sectionId === extra.sectionId && slot.subjectId === extra.subjectId).map(toScheduleDto),
  }));
}

/**
 * Classes the student could add this term (other sections, subjects they
 * don't take yet), each flagged if it would clash with their schedule.
 */
export async function listAvailableClasses(enrollmentId: number) {
  const enrollment = await loadEnrollment(enrollmentId);
  const [mySlots, offerings, allSlots] = await Promise.all([
    currentSlots(enrollment),
    scheduleRepository.listOfferings(enrollment.semesterId),
    scheduleRepository.listSchedules({ semesterId: enrollment.semesterId }),
  ]);
  const takenSubjects = new Set(mySlots.map((slot) => slot.subjectId));
  // Only classes at the student's level: college students see college classes
  // (any program — e.g. an IT student may take GE101 with an HRS section),
  // Senior High students see Senior High classes. Own program first.
  const seniorHigh = isSeniorHigh(enrollment.program);
  const ownProgramFirst = (programId: number) => (programId === enrollment.programId ? 0 : 1);

  return offerings
    .filter((offering) => offering.sectionId !== enrollment.sectionId && !takenSubjects.has(offering.subjectId))
    .filter((offering) => isSeniorHigh(offering.section.program) === seniorHigh)
    .sort((a, b) => ownProgramFirst(a.section.programId) - ownProgramFirst(b.section.programId))
    .map((offering) => {
      const slots = allSlots.filter((slot) => slot.sectionId === offering.sectionId && slot.subjectId === offering.subjectId);
      const clashes = slots.flatMap((slot) => mySlots.filter((mine) => scheduleRepository.slotsOverlap(slot, mine)));
      const schedule = toScheduleDto(offering);
      return {
        section: schedule.section,
        subject: schedule.subject,
        instructor: schedule.instructor,
        slots: slots.map(toScheduleDto),
        conflictsWith: [...new Set(clashes.map((clash) => clash.subject.code))],
      };
    });
}

export async function addExtraSubject(enrollmentId: number, input: ExtraSubjectInput, actor: Actor) {
  const enrollment = await loadEnrollment(enrollmentId);
  if (["DROPPED", "WITHDRAWN"].includes(enrollment.status)) {
    throw AppError.badRequest("Subjects cannot be added to a dropped or withdrawn enrollment.");
  }
  if (input.sectionId === enrollment.sectionId) {
    throw AppError.validation({ sectionId: "The student already attends all classes of their own section." });
  }

  const section = await academicRepository.findSectionById(input.sectionId);
  if (!section || section.academicYearId !== enrollment.semester.academicYearId) {
    throw AppError.validation({ sectionId: "Choose a section from the same academic year." });
  }

  const newSlots = await scheduleRepository.listSchedules({ semesterId: enrollment.semesterId, sectionId: input.sectionId, subjectId: input.subjectId });
  if (newSlots.length === 0) throw AppError.validation({ subjectId: "This subject is not scheduled for that section this term." });

  const mySlots = await currentSlots(enrollment);
  if (mySlots.some((slot) => slot.subjectId === input.subjectId)) {
    throw AppError.conflict(`${newSlots[0].subject.code} is already on this student's schedule.`, { subjectId: "Already taken this term." });
  }

  const clashes = newSlots.flatMap((slot) =>
    mySlots.filter((mine) => scheduleRepository.slotsOverlap(slot, mine)).map((mine) => ({ newSlot: slot, existing: mine })),
  );
  if (clashes.length) {
    throw new AppError(409, "SCHEDULE_CONFLICT", "This class overlaps the student's current schedule.", {
      details: clashes.map((clash) => ({
        reasons: ["student"],
        schedule: toScheduleDto(clash.existing),
        message: `${clash.existing.subject.code} (${clash.existing.section.name}) ${clash.existing.dayOfWeek} ${clash.existing.startTime}–${clash.existing.endTime}`,
      })),
    });
  }

  const crossEnrollmentFee = input.chargeCrossEnrollmentFee ? await getCrossEnrollmentFee() : 0;

  await prisma.$transaction(async (tx) => {
    if (crossEnrollmentFee > 0) {
      await tx.tuitionAssessment.create({
        data: { enrollmentId, description: `Cross Enrollment Fee — ${newSlots[0].subject.code} (cash basis)`, amount: crossEnrollmentFee, createdById: actor.userId },
      });
    }
    await enrollmentSubjectRepository.createExtraSubject(
      { enrollmentId, sectionId: input.sectionId, subjectId: input.subjectId, createdById: actor.userId },
      tx,
    );
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.ENROLLMENT_SUBJECT_ADDED,
        entityType: "enrollment",
        entityId: enrollmentId,
        description: `Added ${newSlots[0].subject.code} with ${section.name} for irregular student ${enrollment.student.studentNumber} (${enrollment.semester.name}, ${enrollment.semester.academicYear.name})${crossEnrollmentFee ? ` + cross-enrollment fee ₱${crossEnrollmentFee}` : ""}`,
      },
      tx,
    );
  });

  return listExtraSubjects(enrollmentId);
}

export async function removeExtraSubject(enrollmentId: number, extraId: number, actor: Actor) {
  const enrollment = await loadEnrollment(enrollmentId);
  const extra = await enrollmentSubjectRepository.findExtraSubjectById(extraId);
  if (!extra || extra.enrollmentId !== enrollmentId) throw AppError.notFound("Extra subject not found.");

  const graded = await prisma.grade.count({ where: { enrollmentId, subjectId: extra.subjectId } });
  if (graded) throw AppError.badRequest(`${extra.subject.code} already has a grade, so it cannot be removed.`);

  await enrollmentSubjectRepository.deleteExtraSubject(extraId);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.ENROLLMENT_SUBJECT_REMOVED,
    entityType: "enrollment",
    entityId: enrollmentId,
    description: `Removed ${extra.subject.code} (${extra.section.name}) from irregular student ${enrollment.student.studentNumber}`,
  });
  return listExtraSubjects(enrollmentId);
}
