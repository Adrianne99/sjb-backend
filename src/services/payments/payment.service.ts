// Payment recording. This system RECORDS payments made at the cashier — it is
// not an online payment gateway.
//
// Rules:
// - Payments belong to an enrollment (student + term).
// - Amounts are never edited. Mistakes are VOIDED (with a reason) and re-recorded.
// - Voided payments do not reduce the balance.
// - Every action is audited.
import { prisma } from "../../config/database";
import { toPaymentDto } from "../../mappers/payment.mapper";
import * as enrollmentRepository from "../../repositories/enrollment.repository";
import * as paymentRepository from "../../repositories/payment.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import crypto from "node:crypto";
import { fromDateOnlyString, todayInManila } from "../../utils/dates";
import { toMoneyString } from "../../utils/money";
import { buildPaginationMeta, toSkipTake } from "../../utils/pagination";
import type { ListPaymentsQuery, RecordPaymentInput, UpdatePaymentInput } from "../../validators/payment.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { getBalancesForEnrollments } from "./balance.service";
import { notifyLater, notifyPaymentReceived } from "../notifications/student-notifications.service";

export async function listPayments(query: ListPaymentsQuery) {
  const { page, pageSize, dateFrom, dateTo, ...filters } = query;
  const { items, total, recordedTotal } = await paymentRepository.listPayments({
    ...filters,
    dateFrom: dateFrom ? fromDateOnlyString(dateFrom) : undefined,
    dateTo: dateTo ? fromDateOnlyString(dateTo) : undefined,
    ...toSkipTake({ page, pageSize }),
  });
  return {
    items: items.map(toPaymentDto),
    meta: buildPaginationMeta({ page, pageSize }, total),
    summary: { recordedTotal: toMoneyString(recordedTotal) },
  };
}

export async function getPayment(id: number) {
  const payment = await paymentRepository.findPaymentById(id);
  if (!payment) throw AppError.notFound("Payment not found.");
  const balance = (await getBalancesForEnrollments([payment.enrollmentId])).get(payment.enrollmentId)!;
  return { ...toPaymentDto(payment), termBalance: balance };
}

/** e.g. "PAY-20261001-7F3A9C" when the cashier leaves the OR number empty. */
function generateReferenceNumber() {
  const date = todayInManila().replaceAll("-", "");
  return `PAY-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function recordPayment(input: RecordPaymentInput, actor: Actor) {
  const enrollment = await enrollmentRepository.findEnrollmentById(input.enrollmentId);
  if (!enrollment) throw AppError.validation({ enrollmentId: "Enrollment not found." });

  const referenceNumber = input.referenceNumber ?? generateReferenceNumber();
  if (await paymentRepository.referenceNumberExists(referenceNumber)) {
    throw AppError.conflict(`Reference number ${referenceNumber} has already been used.`, { referenceNumber: "Already used." });
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await paymentRepository.createPayment(
      {
        enrollmentId: enrollment.id,
        referenceNumber,
        amount: input.amount,
        paymentDate: fromDateOnlyString(input.paymentDate),
        paymentMethod: input.paymentMethod,
        remarks: input.remarks,
        recordedById: actor.userId!,
      },
      tx,
    );
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.PAYMENT_RECORDED,
        entityType: "payment",
        entityId: created.id,
        description: `Recorded ₱${toMoneyString(input.amount)} (${input.paymentMethod}, ref ${referenceNumber}) for ${enrollment.student.studentNumber} — ${enrollment.semester.name}, ${enrollment.semester.academicYear.name}`,
      },
      tx,
    );
    return created;
  });

  // Saved — email the receipt to the student (in the background).
  notifyLater("payment received", () => notifyPaymentReceived(payment.id));
  return getPayment(payment.id);
}

export async function updatePayment(id: number, input: UpdatePaymentInput, actor: Actor) {
  const existing = await paymentRepository.findPaymentById(id);
  if (!existing) throw AppError.notFound("Payment not found.");
  if (existing.status === "VOIDED") throw AppError.badRequest("Voided payments cannot be edited.");
  if (await paymentRepository.referenceNumberExists(input.referenceNumber, id)) {
    throw AppError.conflict("That reference number is used by another payment.", { referenceNumber: "Already used." });
  }

  const before = {
    paymentDate: existing.paymentDate.toISOString().slice(0, 10),
    paymentMethod: existing.paymentMethod,
    referenceNumber: existing.referenceNumber,
    remarks: existing.remarks,
  };

  await prisma.$transaction(async (tx) => {
    await paymentRepository.updatePayment(
      id,
      {
        paymentDate: fromDateOnlyString(input.paymentDate),
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        remarks: input.remarks,
      },
      tx,
    );
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.PAYMENT_UPDATED,
        entityType: "payment",
        entityId: id,
        description: `Corrected details of payment ${existing.referenceNumber} for ${existing.enrollment.student.studentNumber}`,
        metadata: { before, after: input },
      },
      tx,
    );
  });

  return getPayment(id);
}

export async function voidPayment(id: number, reason: string, actor: Actor) {
  const existing = await paymentRepository.findPaymentById(id);
  if (!existing) throw AppError.notFound("Payment not found.");
  if (existing.status === "VOIDED") throw AppError.badRequest("This payment is already voided.");

  await prisma.$transaction(async (tx) => {
    await paymentRepository.updatePayment(
      id,
      { status: "VOIDED", voidReason: reason, voidedById: actor.userId, voidedAt: new Date() },
      tx,
    );
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.PAYMENT_VOIDED,
        entityType: "payment",
        entityId: id,
        description: `Voided payment ${existing.referenceNumber} (₱${toMoneyString(existing.amount)}) for ${existing.enrollment.student.studentNumber}. Reason: ${reason}`,
      },
      tx,
    );
  });

  return getPayment(id);
}

export async function listStudentPayments(studentId: number) {
  return (await paymentRepository.findPaymentsForStudent(studentId)).map(toPaymentDto);
}
