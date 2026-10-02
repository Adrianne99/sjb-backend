// Which year levels a program allows.
//   Senior High School programs -> Grade 11 and Grade 12
//   College programs            -> 1st year .. durationYears (IT and HRS: 1st and 2nd year)
import { AppError } from "./app-error";

interface ProgramLike {
  level: string;
  durationYears: number;
}

export function isSeniorHigh(program: Pick<ProgramLike, "level">): boolean {
  return /senior high/i.test(program.level);
}

export function allowedYearLevels(program: ProgramLike): number[] {
  if (isSeniorHigh(program)) return [11, 12];
  return Array.from({ length: Math.max(1, program.durationYears) }, (_, index) => index + 1);
}

export function yearLevelLabel(yearLevel: number): string {
  if (yearLevel >= 7) return `Grade ${yearLevel}`;
  const suffix = yearLevel === 1 ? "st" : yearLevel === 2 ? "nd" : yearLevel === 3 ? "rd" : "th";
  return `${yearLevel}${suffix} Year`;
}

/** Throws a field error if the year level does not exist for the program. */
export function assertYearLevel(program: ProgramLike & { code: string }, yearLevel: number, field = "yearLevel") {
  const allowed = allowedYearLevels(program);
  if (!allowed.includes(yearLevel)) {
    throw AppError.validation({ [field]: `${program.code} only has ${allowed.map(yearLevelLabel).join(" and ")}.` });
  }
}
