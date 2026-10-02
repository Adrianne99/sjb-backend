// Aggregate queries used to calculate balances.
//
//   Balance = SUM(tuition_assessments.amount) - SUM(payments.amount WHERE status = 'RECORDED')
//
// VOIDED payments are always excluded. These queries are the ONLY place balances
// are calculated — the frontend just displays the result.
import { prisma } from "../config/database";
import { Prisma } from "../generated/prisma/client";

/** { enrollmentId -> total assessed } */
export async function sumAssessmentsByEnrollment(enrollmentIds: number[]) {
  if (enrollmentIds.length === 0) return new Map<number, Prisma.Decimal>();
  const rows = await prisma.tuitionAssessment.groupBy({
    by: ["enrollmentId"],
    where: { enrollmentId: { in: enrollmentIds } },
    _sum: { amount: true },
  });
  return new Map(rows.map((row) => [row.enrollmentId, row._sum.amount ?? new Prisma.Decimal(0)]));
}

/** { enrollmentId -> total of RECORDED (not voided) payments } */
export async function sumRecordedPaymentsByEnrollment(enrollmentIds: number[]) {
  if (enrollmentIds.length === 0) return new Map<number, Prisma.Decimal>();
  const rows = await prisma.payment.groupBy({
    by: ["enrollmentId"],
    where: { enrollmentId: { in: enrollmentIds }, status: "RECORDED" },
    _sum: { amount: true },
  });
  return new Map(rows.map((row) => [row.enrollmentId, row._sum.amount ?? new Prisma.Decimal(0)]));
}

export function findEnrollmentIdsForStudents(studentIds: number[]) {
  return prisma.enrollment.findMany({
    where: { studentId: { in: studentIds } },
    select: { id: true, studentId: true },
  });
}

export interface OutstandingBalanceRow {
  studentId: number;
  assessed: Prisma.Decimal;
  paid: Prisma.Decimal;
  balance: Prisma.Decimal;
}

/**
 * Students whose balance is above zero (optionally for one term).
 * Uses a parameterized raw query (Prisma.sql) — values are never concatenated
 * into the SQL string, so this is safe from SQL injection.
 */
export async function findOutstandingBalances(options: { semesterId?: number; limit?: number; offset?: number }) {
  const termFilter = options.semesterId ? Prisma.sql`AND e.semester_id = ${options.semesterId}` : Prisma.empty;

  const balancesQuery = Prisma.sql`
    SELECT e.student_id AS studentId,
           COALESCE(SUM(a.assessed), 0) AS assessed,
           COALESCE(SUM(p.paid), 0) AS paid,
           COALESCE(SUM(a.assessed), 0) - COALESCE(SUM(p.paid), 0) AS balance
    FROM enrollments e
    LEFT JOIN (SELECT enrollment_id, SUM(amount) AS assessed FROM tuition_assessments GROUP BY enrollment_id) a
           ON a.enrollment_id = e.id
    LEFT JOIN (SELECT enrollment_id, SUM(amount) AS paid FROM payments WHERE status = 'RECORDED' GROUP BY enrollment_id) p
           ON p.enrollment_id = e.id
    JOIN students s ON s.id = e.student_id
    WHERE s.status <> 'ARCHIVED' ${termFilter}
    GROUP BY e.student_id
    HAVING balance > 0`;

  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<OutstandingBalanceRow[]>`
      ${balancesQuery}
      ORDER BY balance DESC
      LIMIT ${options.limit ?? 20} OFFSET ${options.offset ?? 0}`,
    prisma.$queryRaw<Array<{ studentCount: bigint | number; totalOutstanding: Prisma.Decimal | null }>>`
      SELECT COUNT(*) AS studentCount, SUM(balance) AS totalOutstanding FROM (${balancesQuery}) AS outstanding`,
  ]);

  return {
    rows,
    studentCount: Number(totals[0]?.studentCount ?? 0),
    totalOutstanding: totals[0]?.totalOutstanding ?? new Prisma.Decimal(0),
  };
}
