import type { PaymentWithRelations } from "../repositories/payment.repository";
import { toDateOnlyString } from "../utils/dates";
import { toMoneyString } from "../utils/money";
import { toStudentSummaryDto } from "./student.mapper";

type StaffRef = PaymentWithRelations["recordedBy"] | null;

function staffDisplayName(staff: StaffRef) {
  if (!staff) return null;
  return staff.staffProfile ? `${staff.staffProfile.firstName} ${staff.staffProfile.lastName}` : staff.username;
}

/** Payment as seen by staff. */
export function toPaymentDto(payment: PaymentWithRelations) {
  return {
    id: payment.id,
    enrollmentId: payment.enrollmentId,
    referenceNumber: payment.referenceNumber,
    amount: toMoneyString(payment.amount),
    paymentDate: toDateOnlyString(payment.paymentDate),
    paymentMethod: payment.paymentMethod,
    remarks: payment.remarks,
    status: payment.status,
    voidReason: payment.voidReason,
    voidedAt: payment.voidedAt?.toISOString() ?? null,
    voidedBy: staffDisplayName(payment.voidedBy),
    recordedBy: staffDisplayName(payment.recordedBy),
    createdAt: payment.createdAt.toISOString(),
    semesterId: payment.enrollment.semesterId,
    academicYearName: payment.enrollment.semester.academicYear.name,
    semesterName: payment.enrollment.semester.name,
    termLabel: `${payment.enrollment.semester.name}, ${payment.enrollment.semester.academicYear.name}`,
    student: toStudentSummaryDto(payment.enrollment.student),
  };
}

/** Payment as seen by the student (no staff names or internal notes). */
export function toStudentPaymentDto(payment: PaymentWithRelations) {
  return {
    id: payment.id,
    referenceNumber: payment.referenceNumber,
    amount: toMoneyString(payment.amount),
    paymentDate: toDateOnlyString(payment.paymentDate),
    paymentMethod: payment.paymentMethod,
    status: payment.status,
    termLabel: `${payment.enrollment.semester.name}, ${payment.enrollment.semester.academicYear.name}`,
  };
}
