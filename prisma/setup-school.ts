// =============================================================================
// Loads the school's REAL starting data — safe to use in production.
// (The demo seed, `npm run db:seed`, is fictional and must never be used there.)
//
//   npm run setup-school
//
// Against the online database (PowerShell):
//   $env:DATABASE_URL = "mysql://...aivencloud.com:12345/defaultdb?sslaccept=accept_invalid_certs"
//   npm run setup-school
//
// It adds, ONLY if they are missing (running it again changes nothing):
//   - the programs: Senior High School (Grade 11–12), IT and HRS (1st–2nd year)
//   - the tuition fee table from the school's "Tuition Fee Options" poster
//   - default settings: grading scales (Senior High 60–100) and the cross-enrollment fee
// Rows that already exist are left alone, so edits made in the app are kept.
// =============================================================================
import "dotenv/config";
import { prisma } from "../src/config/database";
import { DEFAULT_GRADING_BY_LEVEL, DEFAULT_GRADING_CONFIG, DEFAULT_STUDENT_EDITABLE_FIELDS } from "../src/validators/settings.validators";

const PROGRAMS = [
  { code: "SHS", name: "Senior High School", level: "Senior High School", durationYears: 2, description: "Grade 11 and Grade 12." },
  { code: "IT", name: "Information Technology", level: "College", durationYears: 2, description: "Two-year college program (1st and 2nd year)." },
  { code: "HRS", name: "Hotel and Restaurant Services", level: "College", durationYears: 2, description: "Two-year college program (1st and 2nd year)." },
];

// "Tuition Fee Options": ₱320 per unit + ₱2,500 miscellaneous fee; final payment = the rest.
const COLLEGE_FEES = [
  { program: "IT", yearLevel: 1, units: 23, prelim: 2870, midterm: 2870 },
  { program: "HRS", yearLevel: 1, units: 23, prelim: 2870, midterm: 2870 },
  { program: "IT", yearLevel: 2, units: 24, prelim: 2810, midterm: 2810 },
  { program: "HRS", yearLevel: 2, units: 21, prelim: 2657, midterm: 2657 },
];
// Senior High: ₱25,000 for the whole school year without a voucher (free with a voucher).
const SENIOR_HIGH_ANNUAL_TUITION = 25000;

const SETTINGS: Array<[string, unknown]> = [
  ["grading", DEFAULT_GRADING_CONFIG],
  ["grading_by_level", DEFAULT_GRADING_BY_LEVEL],
  ["student_editable_fields", DEFAULT_STUDENT_EDITABLE_FIELDS],
  ["cross_enrollment_fee", 2500],
];

async function main() {
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").host;
    } catch {
      return "(invalid DATABASE_URL)";
    }
  })();
  console.log(`🏫 Setting up school data in ${host} ...`);

  const programIds: Record<string, number> = {};
  for (const program of PROGRAMS) {
    const existing = await prisma.program.findUnique({ where: { code: program.code } });
    const row = existing ?? (await prisma.program.create({ data: program }));
    programIds[program.code] = row.id;
    console.log(`  ${existing ? "•" : "+"} Program ${program.code}${existing ? " (already there)" : ""}`);
  }

  const feeRows = [
    ...COLLEGE_FEES.map((fee) => ({
      programId: programIds[fee.program],
      yearLevel: fee.yearLevel,
      label: `${fee.program} year ${fee.yearLevel}`,
      data: {
        units: fee.units,
        ratePerUnit: 320,
        miscFee: 2500,
        downPayment: 2000,
        prelimPayment: fee.prelim,
        midtermPayment: fee.midterm,
        earlyBirdDiscount: 1000,
        cashDiscount: 500,
      },
    })),
    ...[11, 12].map((yearLevel) => ({ programId: programIds.SHS, yearLevel, label: `SHS Grade ${yearLevel}`, data: { annualTuition: SENIOR_HIGH_ANNUAL_TUITION } })),
  ];
  for (const fee of feeRows) {
    const key = { programId_yearLevel: { programId: fee.programId, yearLevel: fee.yearLevel } };
    const existing = await prisma.feeSchedule.findUnique({ where: key });
    if (!existing) await prisma.feeSchedule.create({ data: { programId: fee.programId, yearLevel: fee.yearLevel, ...fee.data } });
    console.log(`  ${existing ? "•" : "+"} Tuition fees for ${fee.label}${existing ? " (already there)" : ""}`);
  }

  for (const [key, value] of SETTINGS) {
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    if (!existing) await prisma.systemSetting.create({ data: { key, value: value as never } });
    console.log(`  ${existing ? "•" : "+"} Setting ${key}${existing ? " (already there)" : ""}`);
  }

  await prisma.auditLog.create({
    data: { userId: null, action: "SETTINGS_UPDATED", entityType: "system_setting", entityId: "setup-school", description: "School starting data (programs, tuition fees, settings) loaded from the command line" },
  });
  console.log("✅ Done. (+ = added, • = already there and left unchanged)");
}

main()
  .catch((error) => {
    console.error("❌ Failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
