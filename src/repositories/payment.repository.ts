// Database access for payments. There is intentionally NO delete function:
// financial records are voided, never removed.
import { prisma, type DbClient } from "../config/database";
import type { PaymentMethod, PaymentStatus, Prisma } from "../generated/prisma/client";

const staffName = { select: { id: true, username: true, staffProfile: true } } as const;

export const paymentInclude = {
  enrollment: {
    include: {
      student: { include: { program: true } },
      semester: { include: { academicYear: true } },
    },
  },
  recordedBy: staffName,
  voidedBy: staffName,
} satisfies Prisma.PaymentInclude;

export type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface ListPaymentsFilters {
  search?: string;
  studentId?: number;
  semesterId?: number;
  academicYearId?: number;
  status?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  dateFrom?: Date;
  dateTo?: Date;
  skip: number;
  take: number;
}

function buildWhere(filters: Omit<ListPaymentsFilters, "skip" | "take">): Prisma.PaymentWhereInput {
  const words = filters.search?.split(/\s+/).filter(Boolean).slice(0, 5) ?? [];
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? { paymentDate: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
      : {}),
    enrollment: {
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
      ...(filters.academicYearId ? { semester: { academicYearId: filters.academicYearId } } : {}),
    },
    ...(words.length
      ? {
          AND: words.map((word) => ({
            OR: [
              { referenceNumber: { contains: word } },
              { enrollment: { student: { studentNumber: { contains: word } } } },
              { enrollment: { student: { firstName: { contains: word } } } },
              { enrollment: { student: { lastName: { contains: word } } } },
            ],
          })),
        }
      : {}),
  };
}

export async function listPayments(filters: ListPaymentsFilters) {
  const where = buildWhere(filters);
  const [items, total, recordedSum] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: paymentInclude,
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.payment.count({ where }),
    // Total of the filtered, non-voided payments (for the summary bar).
    prisma.payment.aggregate({ where: { AND: [where, { status: "RECORDED" }] }, _sum: { amount: true } }),
  ]);
  return { items, total, recordedTotal: recordedSum._sum.amount };
}

export function findPaymentById(id: number, db: DbClient = prisma) {
  return db.payment.findUnique({ where: { id }, include: paymentInclude });
}

export function referenceNumberExists(referenceNumber: string, excludeId?: number, db: DbClient = prisma) {
  return db.payment
    .count({ where: { referenceNumber, ...(excludeId ? { NOT: { id: excludeId } } : {}) } })
    .then((count) => count > 0);
}

export function createPayment(data: Prisma.PaymentUncheckedCreateInput, db: DbClient = prisma) {
  return db.payment.create({ data, include: paymentInclude });
}

export function updatePayment(id: number, data: Prisma.PaymentUncheckedUpdateInput, db: DbClient = prisma) {
  return db.payment.update({ where: { id }, data, include: paymentInclude });
}

export function findPaymentsForStudent(studentId: number) {
  return prisma.payment.findMany({
    where: { enrollment: { studentId } },
    include: paymentInclude,
    orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
  });
}

export function findRecentPayments(take: number) {
  return prisma.payment.findMany({ include: paymentInclude, orderBy: { createdAt: "desc" }, take });
}
