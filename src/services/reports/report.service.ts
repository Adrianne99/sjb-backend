// Dashboard numbers and administrative reports. All figures come straight
// from the database at request time — nothing is cached or estimated.
import { prisma } from "../../config/database";
import { roleHasPermission, type Permission } from "../../config/permissions";
import { Prisma } from "../../generated/prisma/client";
import type { RoleName } from "../../generated/prisma/client";
import { toEnrollmentDto } from "../../mappers/enrollment.mapper";
import { toGradeDto } from "../../mappers/grade.mapper";
import { toPaymentDto } from "../../mappers/payment.mapper";
import { toScheduleDto } from "../../mappers/schedule.mapper";
import { toStudentSummaryDto } from "../../mappers/student.mapper";
import * as academicRepository from "../../repositories/academic.repository";
import * as auditRepository from "../../repositories/audit.repository";
import * as balanceRepository from "../../repositories/balance.repository";
import * as enrollmentRepository from "../../repositories/enrollment.repository";
import * as gradeRepository from "../../repositories/grade.repository";
import * as paymentRepository from "../../repositories/payment.repository";
import * as scheduleRepository from "../../repositories/schedule.repository";
import { fromDateOnlyString, nowInManila } from "../../utils/dates";
import { toMoneyString } from "../../utils/money";
import { buildPaginationMeta, toSkipTake, type PaginationQuery } from "../../utils/pagination";
import { toAuditLogDto } from "../audit/audit.service";
import { getGradingResolver } from "../settings/settings.service";

/** Collections per month for the last `months` months (RECORDED payments only). */
async function collectionsByMonth(months: number) {
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - (months - 1), 1);
  since.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.$queryRaw<Array<{ month: string; total: Prisma.Decimal }>>`
    SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, SUM(amount) AS total
    FROM payments
    WHERE status = 'RECORDED' AND payment_date >= ${since}
    GROUP BY month
    ORDER BY month`;

  // Fill months with no payments so the chart has no gaps.
  const result: Array<{ month: string; total: string }> = [];
  for (let i = 0; i < months; i++) {
    const date = new Date(since);
    date.setUTCMonth(since.getUTCMonth() + i);
    const key = date.toISOString().slice(0, 7);
    result.push({ month: key, total: toMoneyString(rows.find((row) => row.month === key)?.total ?? 0) });
  }
  return result;
}

/** Runs `query` only when allowed; otherwise returns `fallback` without touching the database. */
function onlyIf<T>(allowed: boolean, query: () => Promise<T>, fallback: T): Promise<T> {
  return allowed ? query() : Promise.resolve(fallback);
}

/**
 * The office dashboard. Every office role gets one, but each part is only
 * filled in when the role has the matching permission — e.g. a cashier sees
 * payments but no enrollments or grades, and a registrar the other way round.
 * Parts a role may not see are null (stats) or empty lists.
 */
export async function getDashboard(role: RoleName) {
  const may = (permission: Permission) => roleHasPermission(role, permission);
  const canStudents = may("students:read");
  const canEnrollments = may("enrollments:read");
  const canPayments = may("payments:read");
  const canGrades = may("grades:read");
  const canSchedules = may("schedules:read");

  const currentTerm = await academicRepository.findCurrentSemester();
  const termId = currentTerm?.id ?? -1;
  const now = nowInManila();

  const [
    totalStudents,
    termCounts,
    yearLevelCounts,
    outstanding,
    monthly,
    recentEnrollments,
    recentPayments,
    recentGrades,
    todaysClasses,
    recentActivity,
    gradingFor,
  ] = await Promise.all([
    onlyIf(canStudents, () => prisma.student.count({ where: { status: "ACTIVE" } }), null),
    onlyIf(canEnrollments, () => prisma.enrollment.groupBy({ by: ["status"], where: { semesterId: termId }, _count: { _all: true } }), []),
    onlyIf(
      canEnrollments,
      () =>
        prisma.enrollment.groupBy({
          by: ["yearLevel"],
          where: { semesterId: termId, status: { in: ["ENROLLED", "PENDING"] } },
          _count: { _all: true },
          orderBy: { yearLevel: "asc" },
        }),
      [],
    ),
    onlyIf(canPayments, () => balanceRepository.findOutstandingBalances({ limit: 1 }), null),
    onlyIf(canPayments, () => collectionsByMonth(6), []),
    onlyIf(canEnrollments, () => enrollmentRepository.findRecentEnrollments(5), []),
    onlyIf(canPayments, () => paymentRepository.findRecentPayments(5), []),
    onlyIf(canGrades, () => gradeRepository.findRecentGradeUpdates(5), []),
    onlyIf(canSchedules, () => scheduleRepository.listSchedules({ semesterId: termId, dayOfWeek: now.dayOfWeek }), []),
    onlyIf(may("audit:read"), () => auditRepository.listRecentAuditLogs(8), []),
    getGradingResolver(),
  ]);

  const countFor = (status: string) => termCounts.find((row) => row.status === status)?._count._all ?? 0;

  return {
    currentTerm: currentTerm ? { id: currentTerm.id, label: `${currentTerm.name}, ${currentTerm.academicYear.name}` } : null,
    stats: {
      totalStudents,
      currentlyEnrolled: canEnrollments ? countFor("ENROLLED") : null,
      pendingEnrollment: canEnrollments ? countFor("PENDING") : null,
      studentsWithBalance: outstanding ? outstanding.studentCount : null,
      outstandingTotal: outstanding ? toMoneyString(outstanding.totalOutstanding) : null,
    },
    enrollmentByYearLevel: yearLevelCounts.map((row) => ({ yearLevel: row.yearLevel, count: row._count._all })),
    collectionsByMonth: monthly,
    recentEnrollments: recentEnrollments.map(toEnrollmentDto),
    recentPayments: recentPayments.map(toPaymentDto),
    recentGradeUpdates: recentGrades.map((grade) => toGradeDto(grade, gradingFor(grade.enrollment.program.level))),
    upcomingClasses: todaysClasses.filter((slot) => slot.endTime > now.time).slice(0, 6).map(toScheduleDto),
    recentActivity: recentActivity.map(toAuditLogDto),
  };
}

/** Enrollment counts by program and year level for one term. */
export async function getEnrollmentSummary(semesterId?: number) {
  const term = semesterId
    ? await academicRepository.findSemesterById(semesterId)
    : await academicRepository.findCurrentSemester();
  if (!term) return { term: null, rows: [], totals: {} };

  const [groups, programs] = await Promise.all([
    prisma.enrollment.groupBy({
      by: ["programId", "yearLevel", "status"],
      where: { semesterId: term.id },
      _count: { _all: true },
    }),
    prisma.program.findMany(),
  ]);

  const rows = new Map<string, { programCode: string; programName: string; yearLevel: number; counts: Record<string, number>; total: number }>();
  const totals: Record<string, number> = {};

  for (const group of groups) {
    const program = programs.find((item) => item.id === group.programId);
    const key = `${group.programId}-${group.yearLevel}`;
    const row = rows.get(key) ?? {
      programCode: program?.code ?? "?",
      programName: program?.name ?? "Unknown",
      yearLevel: group.yearLevel,
      counts: {},
      total: 0,
    };
    row.counts[group.status] = group._count._all;
    row.total += group._count._all;
    totals[group.status] = (totals[group.status] ?? 0) + group._count._all;
    rows.set(key, row);
  }

  return {
    term: { id: term.id, label: `${term.name}, ${term.academicYear.name}` },
    rows: [...rows.values()].sort((a, b) => a.programCode.localeCompare(b.programCode) || a.yearLevel - b.yearLevel),
    totals,
  };
}

/** Collections between two dates (inclusive), by method and by day. */
export async function getCollections(dateFrom: string, dateTo: string) {
  const where: Prisma.PaymentWhereInput = {
    status: "RECORDED",
    paymentDate: { gte: fromDateOnlyString(dateFrom), lte: fromDateOnlyString(dateTo) },
  };

  const [byMethod, byDay, voided] = await Promise.all([
    prisma.payment.groupBy({ by: ["paymentMethod"], where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["paymentDate"], where, _sum: { amount: true }, _count: { _all: true }, orderBy: { paymentDate: "asc" } }),
    prisma.payment.aggregate({
      where: { status: "VOIDED", paymentDate: { gte: fromDateOnlyString(dateFrom), lte: fromDateOnlyString(dateTo) } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const total = byMethod.reduce((sum, row) => sum.plus(row._sum.amount ?? 0), new Prisma.Decimal(0));
  return {
    dateFrom,
    dateTo,
    total: toMoneyString(total),
    paymentCount: byMethod.reduce((sum, row) => sum + row._count._all, 0),
    voidedCount: voided._count._all,
    voidedTotal: toMoneyString(voided._sum.amount),
    byMethod: byMethod.map((row) => ({ paymentMethod: row.paymentMethod, total: toMoneyString(row._sum.amount), count: row._count._all })),
    byDay: byDay.map((row) => ({ date: row.paymentDate.toISOString().slice(0, 10), total: toMoneyString(row._sum.amount), count: row._count._all })),
  };
}

/** Students with a remaining balance, largest first. */
export async function getOutstandingBalances(query: PaginationQuery & { semesterId?: number }) {
  const { skip, take } = toSkipTake(query);
  const result = await balanceRepository.findOutstandingBalances({ semesterId: query.semesterId, limit: take, offset: skip });
  const students = await prisma.student.findMany({
    where: { id: { in: result.rows.map((row) => row.studentId) } },
    include: { program: true },
  });

  return {
    items: result.rows.map((row) => ({
      student: toStudentSummaryDto(students.find((student) => student.id === row.studentId)!),
      totalAssessed: toMoneyString(row.assessed),
      totalPaid: toMoneyString(row.paid),
      balance: toMoneyString(row.balance),
    })),
    meta: buildPaginationMeta(query, result.studentCount),
    summary: { studentCount: result.studentCount, totalOutstanding: toMoneyString(result.totalOutstanding) },
  };
}
