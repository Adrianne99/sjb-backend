// Tuition fee options (fee schedules) and applying them to enrollments.
//
// Applying fees to an enrollment:
//   1. finds the fee schedule for the enrollment's program + year level,
//   2. builds the charge lines for the chosen payment option (fee-calculator.ts),
//   3. saves the lines + the chosen plan + a snapshot of the numbers used,
// all in ONE transaction. Fees can only be applied once per enrollment; after
// that, adjust individual charge lines.
import { prisma } from "../../config/database";
import type { FeeSchedule, PaymentPlan, Program } from "../../generated/prisma/client";
import * as enrollmentRepository from "../../repositories/enrollment.repository";
import * as settingsRepository from "../../repositories/settings.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { toMoneyString } from "../../utils/money";
import { fullName } from "../../utils/person";
import { assertYearLevel, isSeniorHigh, yearLevelLabel } from "../../utils/year-levels";
import type { ApplyFeesInput, FeeScheduleInput } from "../../validators/fee.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { buildFeeLines, PLAN_LABELS, plansFor, termTotal, type FeeBreakdown } from "./fee-calculator";

const CROSS_ENROLLMENT_FEE_KEY = "cross_enrollment_fee";
const DEFAULT_CROSS_ENROLLMENT_FEE = 2500;

export function toBreakdown(schedule: FeeSchedule): FeeBreakdown {
  return {
    units: schedule.units,
    ratePerUnit: Number(schedule.ratePerUnit),
    miscFee: Number(schedule.miscFee),
    downPayment: Number(schedule.downPayment),
    prelimPayment: Number(schedule.prelimPayment),
    midtermPayment: Number(schedule.midtermPayment),
    earlyBirdDiscount: Number(schedule.earlyBirdDiscount),
    cashDiscount: Number(schedule.cashDiscount),
    annualTuition: schedule.annualTuition === null ? null : Number(schedule.annualTuition),
  };
}

function toScheduleDto(schedule: FeeSchedule & { program: Program }) {
  const breakdown = toBreakdown(schedule);
  const total = breakdown.annualTuition ?? termTotal(breakdown);
  return {
    id: schedule.id,
    programId: schedule.programId,
    programCode: schedule.program.code,
    programName: schedule.program.name,
    yearLevel: schedule.yearLevel,
    yearLevelLabel: yearLevelLabel(schedule.yearLevel),
    ...breakdown,
    isActive: schedule.isActive,
    plans: plansFor(breakdown),
    // Calculated totals, shown in the fee table.
    total: toMoneyString(total),
    finalPayment: toMoneyString(Math.max(0, total - breakdown.downPayment - breakdown.prelimPayment - breakdown.midtermPayment)),
    earlyBirdTotal: toMoneyString(Math.max(0, total - breakdown.earlyBirdDiscount)),
    cashTotal: toMoneyString(Math.max(0, total - breakdown.cashDiscount)),
  };
}

const scheduleOrder = [{ program: { level: "asc" as const } }, { program: { name: "asc" as const } }, { yearLevel: "asc" as const }];

// --- Fee schedules ----------------------------------------------------------------

export async function getCrossEnrollmentFee(): Promise<number> {
  const setting = await settingsRepository.findSetting(CROSS_ENROLLMENT_FEE_KEY);
  const value = Number(setting?.value);
  return Number.isFinite(value) && value >= 0 && setting ? value : DEFAULT_CROSS_ENROLLMENT_FEE;
}

/** Public "Tuition Fee Options" for the website. */
export async function listPublicFees() {
  const schedules = await prisma.feeSchedule.findMany({
    where: { isActive: true, program: { isActive: true } },
    include: { program: true },
    orderBy: scheduleOrder,
  });
  return { schedules: schedules.map(toScheduleDto), crossEnrollmentFee: toMoneyString(await getCrossEnrollmentFee()) };
}

export async function listFeeSchedules() {
  const schedules = await prisma.feeSchedule.findMany({ include: { program: true }, orderBy: scheduleOrder });
  return { schedules: schedules.map(toScheduleDto), crossEnrollmentFee: toMoneyString(await getCrossEnrollmentFee()) };
}

async function validateSchedule(input: FeeScheduleInput) {
  const program = await prisma.program.findUnique({ where: { id: input.programId } });
  if (!program) throw AppError.validation({ programId: "Program not found." });
  assertYearLevel(program, input.yearLevel);
  if (isSeniorHigh(program) && input.annualTuition === null) {
    throw AppError.validation({ annualTuition: "Enter the whole-year tuition for Senior High School." });
  }
  if (!isSeniorHigh(program)) {
    const total = input.units * input.ratePerUnit + input.miscFee;
    if (input.downPayment + input.prelimPayment + input.midtermPayment > total) {
      throw AppError.validation({ midtermPayment: "Down, prelim and midterm payments are more than the total fee." });
    }
  }
  return program;
}

export async function createFeeSchedule(input: FeeScheduleInput, actor: Actor) {
  const program = await validateSchedule(input);
  const exists = await prisma.feeSchedule.findUnique({ where: { programId_yearLevel: { programId: input.programId, yearLevel: input.yearLevel } } });
  if (exists) throw AppError.conflict(`${program.code} ${yearLevelLabel(input.yearLevel)} already has fees. Edit that row instead.`);
  const schedule = await prisma.feeSchedule.create({ data: input, include: { program: true } });
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: "fee_schedule",
    entityId: schedule.id,
    description: `Added tuition fees for ${program.code} ${yearLevelLabel(input.yearLevel)}`,
    metadata: input,
  });
  return toScheduleDto(schedule);
}

export async function updateFeeSchedule(id: number, input: FeeScheduleInput, actor: Actor) {
  const existing = await prisma.feeSchedule.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound("Fee schedule not found.");
  const program = await validateSchedule(input);
  const schedule = await prisma.feeSchedule.update({ where: { id }, data: input, include: { program: true } });
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: "fee_schedule",
    entityId: id,
    description: `Updated tuition fees for ${program.code} ${yearLevelLabel(input.yearLevel)} (applies to fees applied from now on)`,
    metadata: input,
  });
  return toScheduleDto(schedule);
}

export async function updateCrossEnrollmentFee(amount: number, actor: Actor) {
  await settingsRepository.upsertSetting(CROSS_ENROLLMENT_FEE_KEY, amount, actor.userId);
  await recordAudit(actor, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: "system_setting",
    entityId: CROSS_ENROLLMENT_FEE_KEY,
    description: `Set the cross-enrollment fee to ₱${toMoneyString(amount)} per subject`,
  });
  return toMoneyString(amount);
}

// --- Applying fees to an enrollment ------------------------------------------------

/**
 * Units the student takes this term (the default for "Units taken this term"):
 *   their own section's subjects (or the fee table's units if no section / no classes yet)
 *   + the extra subjects of an irregular student.
 */
async function unitsThisTerm(enrollment: { id: number; semesterId: number; sectionId: number | null }, feeTableUnits: number) {
  let base = 0;
  if (enrollment.sectionId) {
    const classes = await prisma.classSchedule.findMany({
      where: { semesterId: enrollment.semesterId, sectionId: enrollment.sectionId },
      distinct: ["subjectId"],
      select: { subject: { select: { units: true } } },
    });
    base = classes.reduce((sum, item) => sum + Number(item.subject.units), 0);
  }
  const baseSource: "section" | "fee table" = base > 0 ? "section" : "fee table";
  if (base === 0) base = feeTableUnits;

  const extras = await prisma.enrollmentSubject.findMany({ where: { enrollmentId: enrollment.id }, select: { subject: { select: { units: true } } } });
  const extra = extras.reduce((sum, item) => sum + Number(item.subject.units), 0);
  return { base: Math.round(base), baseSource, extra: Math.round(extra), extraSubjects: extras.length, total: Math.round(base + extra) };
}

export async function applyFees(enrollmentId: number, input: ApplyFeesInput, actor: Actor) {
  const enrollment = await enrollmentRepository.findEnrollmentById(enrollmentId);
  if (!enrollment) throw AppError.notFound("Enrollment not found.");

  const schedule = await prisma.feeSchedule.findUnique({
    where: { programId_yearLevel: { programId: enrollment.programId, yearLevel: enrollment.yearLevel } },
  });
  if (!schedule || !schedule.isActive) {
    throw AppError.badRequest(
      `There are no tuition fees for ${enrollment.program.code} ${yearLevelLabel(enrollment.yearLevel)} yet. Add them in Settings → Tuition & fees.`,
    );
  }

  const unitsDetail = await unitsThisTerm(enrollment, schedule.units);
  const breakdown = { ...toBreakdown(schedule), units: input.units ?? unitsDetail.total };
  const allowed = plansFor(breakdown);
  if (!allowed.includes(input.plan)) {
    throw AppError.validation({ plan: `Choose one of: ${allowed.map((plan) => PLAN_LABELS[plan]).join(", ")}.` });
  }

  // Senior High pays tuition once per school year: skip it if another term already has it.
  let annualAlreadyCharged = false;
  if (input.plan === "SHS_NO_VOUCHER") {
    const charged = await prisma.enrollment.count({
      where: {
        studentId: enrollment.studentId,
        id: { not: enrollment.id },
        paymentPlan: "SHS_NO_VOUCHER",
        semester: { academicYearId: enrollment.semester.academicYearId },
      },
    });
    annualAlreadyCharged = charged > 0;
  }

  const lines = buildFeeLines(breakdown, input.plan, { annualAlreadyCharged });
  const total = lines.reduce((sum, line) => sum + Number(line.amount), 0);
  const note = annualAlreadyCharged
    ? "The whole-year tuition was already charged in another term of this school year."
    : input.plan === "SHS_VOUCHER"
      ? "Tuition is free with a Senior High voucher."
      : null;
  const result = {
    plan: input.plan,
    planLabel: PLAN_LABELS[input.plan],
    lines: lines.map((line) => ({ description: line.description, amount: line.amount.toFixed(2) })),
    total: toMoneyString(total),
    note,
    /** Units used, and where the default came from (shown under the units box). */
    units: breakdown.units,
    unitsDetail,
  };
  if (input.preview) return result;

  const alreadyCharged = await prisma.tuitionAssessment.count({ where: { enrollmentId } });
  if (alreadyCharged || enrollment.paymentPlan) {
    throw AppError.conflict("Fees were already applied to this enrollment. Adjust the individual charges instead.");
  }

  await prisma.$transaction(async (tx) => {
    for (const line of lines) {
      await tx.tuitionAssessment.create({ data: { enrollmentId, description: line.description, amount: line.amount, createdById: actor.userId } });
    }
    await tx.enrollment.update({ where: { id: enrollmentId }, data: { paymentPlan: input.plan, feeBreakdown: { ...breakdown } } });
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.FEES_APPLIED,
        entityType: "enrollment",
        entityId: enrollmentId,
        description: `Applied tuition fees (${PLAN_LABELS[input.plan]}, ₱${toMoneyString(total)}) to ${enrollment.student.studentNumber} ${fullName(enrollment.student)} — ${enrollment.semester.name}, ${enrollment.semester.academicYear.name}`,
        metadata: { plan: input.plan, units: breakdown.units, total },
      },
      tx,
    );
  });

  return result;
}

/** Lets other services read a plan snapshot safely. */
export function readBreakdown(value: unknown): FeeBreakdown | null {
  if (!value || typeof value !== "object") return null;
  return value as FeeBreakdown;
}

export type { PaymentPlan };
