// Grading rules, driven entirely by the configurable GradingConfig.
// Nothing here assumes a particular scale.
import type { GradeRemark } from "../../generated/prisma/client";
import { AppError } from "../../utils/app-error";
import type { GradingConfig } from "../../validators/settings.validators";

/** Remarks that do not need a numeric grade. */
export const NON_NUMERIC_REMARKS: GradeRemark[] = ["INCOMPLETE", "DROPPED"];

export function isPassing(grade: number, config: GradingConfig): boolean {
  return config.higherIsBetter ? grade >= config.passingGrade : grade <= config.passingGrade;
}

/**
 * Validates a grade entry and works out its remark.
 * - INCOMPLETE / DROPPED: grade must be empty.
 * - Otherwise a grade is required and the remark is PASSED/FAILED automatically.
 */
export function resolveGradeEntry(
  input: { grade?: number | null; remark?: GradeRemark | null },
  config: GradingConfig,
  field = "grade",
): { grade: number | null; remark: GradeRemark } {
  if (input.remark && NON_NUMERIC_REMARKS.includes(input.remark)) {
    return { grade: null, remark: input.remark };
  }

  if (input.grade === null || input.grade === undefined) {
    throw AppError.validation({ [field]: "Enter a grade, or mark the subject as Incomplete or Dropped." });
  }
  if (input.grade < config.minGrade || input.grade > config.maxGrade) {
    throw AppError.validation({ [field]: `Grade must be between ${config.minGrade} and ${config.maxGrade}.` });
  }

  const factor = 10 ** config.decimalPlaces;
  const rounded = Math.round(input.grade * factor) / factor;
  return { grade: rounded, remark: isPassing(rounded, config) ? "PASSED" : "FAILED" };
}

/** Units-weighted average of numeric grades (INC/DRP are excluded). */
export function computeWeightedAverage(
  rows: Array<{ grade: number | null; units: number }>,
  config: GradingConfig,
): number | null {
  const graded = rows.filter((row) => row.grade !== null && row.units > 0);
  const totalUnits = graded.reduce((sum, row) => sum + row.units, 0);
  if (totalUnits === 0) return null;
  const weighted = graded.reduce((sum, row) => sum + (row.grade as number) * row.units, 0);
  const factor = 10 ** config.decimalPlaces;
  return Math.round((weighted / totalUnits) * factor) / factor;
}
