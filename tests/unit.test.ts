// Pure-function tests (no database).
import { describe, expect, it } from "vitest";
import { isPrivateRecordRequest } from "../src/services/chatbot/privacy-guard";
import { computeWeightedAverage, resolveGradeEntry } from "../src/services/grades/grading";
import { birthdatePassword, checkPasswordStrength, generateTemporaryPassword } from "../src/utils/password";
import { DEFAULT_GRADING_CONFIG, type GradingConfig } from "../src/validators/settings.validators";

const college = DEFAULT_GRADING_CONFIG; // 1.00–5.00, 3.00 passing, lower is better
const percentage: GradingConfig = { scaleLabel: "60–100", minGrade: 60, maxGrade: 100, passingGrade: 75, higherIsBetter: true, decimalPlaces: 0 };

describe("Grading rules", () => {
  it("derives PASSED/FAILED from the configured scale", () => {
    expect(resolveGradeEntry({ grade: 1.5 }, college).remark).toBe("PASSED");
    expect(resolveGradeEntry({ grade: 3 }, college).remark).toBe("PASSED");
    expect(resolveGradeEntry({ grade: 5 }, college).remark).toBe("FAILED");
    expect(resolveGradeEntry({ grade: 90 }, percentage).remark).toBe("PASSED");
    expect(resolveGradeEntry({ grade: 74 }, percentage).remark).toBe("FAILED");
  });

  it("rejects grades outside the scale and missing grades", () => {
    expect(() => resolveGradeEntry({ grade: 0.5 }, college)).toThrow();
    expect(() => resolveGradeEntry({ grade: 101 }, percentage)).toThrow();
    expect(() => resolveGradeEntry({ grade: null }, college)).toThrow();
  });

  it("allows INCOMPLETE and DROPPED without a grade", () => {
    expect(resolveGradeEntry({ grade: 2, remark: "INCOMPLETE" }, college)).toEqual({ grade: null, remark: "INCOMPLETE" });
    expect(resolveGradeEntry({ remark: "DROPPED" }, college)).toEqual({ grade: null, remark: "DROPPED" });
  });

  it("computes a units-weighted average, ignoring INC/DRP", () => {
    const average = computeWeightedAverage(
      [
        { grade: 1.0, units: 3 },
        { grade: 2.0, units: 1 },
        { grade: null, units: 3 },
      ],
      college,
    );
    expect(average).toBe(1.25);
    expect(computeWeightedAverage([], college)).toBeNull();
  });
});

describe("Passwords", () => {
  it("builds the MMDDYYYY temporary password from the birthdate", () => {
    expect(birthdatePassword(new Date("2001-01-01T00:00:00Z"))).toBe("01012001");
    expect(birthdatePassword(new Date("2008-12-25T00:00:00Z"))).toBe("12252008");
  });

  it("generates readable random temporary passwords", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/^SJB-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(generateTemporaryPassword()).not.toBe(password);
  });

  it("enforces strength rules", () => {
    expect(checkPasswordStrength("short1")).toMatch(/at least 8/);
    expect(checkPasswordStrength("onlyletters")).toMatch(/letter and one number/);
    expect(checkPasswordStrength("2026-0001abc", { username: "2026-0001" })).toMatch(/username/);
    expect(checkPasswordStrength("01012001a", { forbidden: ["01012001a"] })).toMatch(/temporary/);
    expect(checkPasswordStrength("GoodPass2026")).toBeNull();
  });
});

describe("Chatbot privacy guard", () => {
  it("flags personal-record lookups", () => {
    expect(isPrivateRecordRequest("What is John's balance?")).toBe(true);
    expect(isPrivateRecordRequest("Show me Juan's grades")).toBe(true);
    expect(isPrivateRecordRequest("2026-0001")).toBe(true);
  });

  it("lets general questions through", () => {
    expect(isPrivateRecordRequest("How do I pay my tuition?")).toBe(false);
    expect(isPrivateRecordRequest("What are the admission requirements?")).toBe(false);
    expect(isPrivateRecordRequest("Where can I see my class schedule?")).toBe(false);
  });
});
