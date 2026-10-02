// Balance calculations. The backend is the ONLY source of truth for money.
import { prisma } from "../../config/database";
import * as balanceRepository from "../../repositories/balance.repository";
import { toDecimal, toMoneyString } from "../../utils/money";
import { buildPaymentSchedule, PLAN_LABELS } from "../fees/fee-calculator";
import { readBreakdown } from "../fees/fee.service";

export interface BalanceSummary {
  totalAssessed: string;
  totalPaid: string;
  balance: string;
}

/** Balance for each enrollment ID. */
export async function getBalancesForEnrollments(enrollmentIds: number[]) {
  const [assessed, paid] = await Promise.all([
    balanceRepository.sumAssessmentsByEnrollment(enrollmentIds),
    balanceRepository.sumRecordedPaymentsByEnrollment(enrollmentIds),
  ]);

  const result = new Map<number, BalanceSummary>();
  for (const id of enrollmentIds) {
    const totalAssessed = toDecimal(assessed.get(id));
    const totalPaid = toDecimal(paid.get(id));
    result.set(id, {
      totalAssessed: toMoneyString(totalAssessed),
      totalPaid: toMoneyString(totalPaid),
      balance: toMoneyString(totalAssessed.minus(totalPaid)),
    });
  }
  return result;
}

/** Overall balance (all terms) for each student ID — used by the student table. */
export async function getBalancesForStudents(studentIds: number[]) {
  const enrollments = await balanceRepository.findEnrollmentIdsForStudents(studentIds);
  const byEnrollment = await getBalancesForEnrollments(enrollments.map((enrollment) => enrollment.id));

  const result = new Map<number, BalanceSummary>();
  for (const studentId of studentIds) {
    let assessed = toDecimal(0);
    let paid = toDecimal(0);
    for (const enrollment of enrollments.filter((row) => row.studentId === studentId)) {
      const balance = byEnrollment.get(enrollment.id);
      assessed = assessed.plus(toDecimal(balance?.totalAssessed));
      paid = paid.plus(toDecimal(balance?.totalPaid));
    }
    result.set(studentId, {
      totalAssessed: toMoneyString(assessed),
      totalPaid: toMoneyString(paid),
      balance: toMoneyString(assessed.minus(paid)),
    });
  }
  return result;
}

/** Full statement for one student: per-term charges, payments and balance. */
export async function getStudentStatement(studentId: number) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    include: {
      semester: { include: { academicYear: true } },
      assessments: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ semester: { academicYear: { startDate: "desc" } } }, { semester: { termNumber: "desc" } }],
  });

  const balances = await getBalancesForEnrollments(enrollments.map((enrollment) => enrollment.id));

  let totalAssessed = toDecimal(0);
  let totalPaid = toDecimal(0);

  const terms = enrollments.map((enrollment) => {
    const summary = balances.get(enrollment.id)!;
    totalAssessed = totalAssessed.plus(summary.totalAssessed);
    totalPaid = totalPaid.plus(summary.totalPaid);
    return {
      enrollmentId: enrollment.id,
      semesterId: enrollment.semesterId,
      termLabel: `${enrollment.semester.name}, ${enrollment.semester.academicYear.name}`,
      academicYear: enrollment.semester.academicYear.name,
      semesterName: enrollment.semester.name,
      enrollmentStatus: enrollment.status,
      isCurrent: enrollment.semester.isCurrent,
      assessments: enrollment.assessments.map((item) => ({
        id: item.id,
        description: item.description,
        amount: toMoneyString(item.amount),
      })),
      paymentPlan: enrollment.paymentPlan,
      paymentPlanLabel: enrollment.paymentPlan ? PLAN_LABELS[enrollment.paymentPlan] : null,
      paymentSchedule: buildPaymentSchedule(enrollment.paymentPlan, readBreakdown(enrollment.feeBreakdown), toDecimal(summary.totalAssessed), toDecimal(summary.totalPaid)),
      ...summary,
    };
  });

  return {
    totalAssessed: toMoneyString(totalAssessed),
    totalPaid: toMoneyString(totalPaid),
    balance: toMoneyString(totalAssessed.minus(totalPaid)),
    terms,
  };
}
