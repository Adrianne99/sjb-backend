// Money helpers. All math uses Prisma.Decimal (never JavaScript floats), and
// amounts are sent to the frontend as strings like "30000.00".
import { Prisma } from "../generated/prisma/client";

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

export function toDecimal(value: MoneyInput): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

export function sumMoney(values: MoneyInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(toDecimal(value)), new Prisma.Decimal(0));
}

export function toMoneyString(value: MoneyInput): string {
  return toDecimal(value).toFixed(2);
}
