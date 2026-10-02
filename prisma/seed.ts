// =============================================================================
// DEVELOPMENT SEED — fills the database with realistic, FICTIONAL sample data.
//
//   npm run db:seed     (only works on an empty database)
//   npm run db:reset    (wipes the database, re-runs migrations, then seeds)
//
// • Never run in production. • No real student records are used.
// • Passwords come from .env (SEED_ADMIN_PASSWORD, SEED_DEMO_PASSWORD).
// • Programs: Senior High School (Grade 11–12), IT and HRS (1st–2nd year).
//   Subjects, fees and announcements below are SAMPLE values for development.
// =============================================================================
import "dotenv/config";
import { prisma } from "../src/config/database";
import type { DayOfWeek, GradeRemark, PaymentMethod, PaymentPlan } from "../src/generated/prisma/client";
import { buildFeeLines, type FeeBreakdown } from "../src/services/fees/fee-calculator";
import { attachSamplePhotos } from "./seed-data/announcement-photos";
import { COLLEGE_INSTRUCTORS, COLLEGE_ROOMS, COLLEGE_SCHEDULE, COLLEGE_SUBJECTS } from "./seed-data/college-schedule";
import { toBreakdown } from "../src/services/fees/fee.service";
import { birthdatePassword, hashPassword } from "../src/utils/password";
import { DEFAULT_GRADING_BY_LEVEL, DEFAULT_GRADING_CONFIG, DEFAULT_STUDENT_EDITABLE_FIELDS } from "../src/validators/settings.validators";

// --- Safety checks -----------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 10) {
    console.error(`❌ ${name} must be set in backend/.env (at least 10 characters) before seeding.`);
    process.exit(1);
  }
  return value;
}

if (process.env.NODE_ENV === "production") {
  console.error("❌ Refusing to run the development seed in production.");
  process.exit(1);
}

const ADMIN_PASSWORD = requireEnv("SEED_ADMIN_PASSWORD");
const DEMO_PASSWORD = requireEnv("SEED_DEMO_PASSWORD");
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || "admin";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@school.test";

// --- Helpers -----------------------------------------------------------------

/** Small deterministic random generator so every seed produces the same data. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = createRandom(20261001);
const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

// --- Reference data ----------------------------------------------------------

const PROGRAMS = [
  { code: "SHS", name: "Senior High School", level: "Senior High School", durationYears: 2, description: "Grade 11 and Grade 12. [Placeholder] If strands are tracked separately, add each strand as its own program." },
  { code: "IT", name: "Information Technology", level: "College", durationYears: 2, description: "Two-year college program (1st and 2nd year)." },
  { code: "HRS", name: "Hotel and Restaurant Services", level: "College", durationYears: 2, description: "Two-year college program (1st and 2nd year)." },
];

/** Senior High subjects count equally (1 unit each), so their average is a simple average. */
const SUBJECTS: Array<{ code: string; name: string; units: number }> = [
  // Senior High School (sample core subjects)
  { code: "OC11", name: "Oral Communication in Context", units: 1 },
  { code: "GM11", name: "General Mathematics", units: 1 },
  { code: "ELS11", name: "Earth and Life Science", units: 1 },
  { code: "PD11", name: "Personal Development", units: 1 },
  { code: "UCSP11", name: "Understanding Culture, Society and Politics", units: 1 },
  { code: "PEH11", name: "Physical Education and Health 1", units: 1 },
  { code: "RW11", name: "Reading and Writing Skills", units: 1 },
  { code: "SP11", name: "Statistics and Probability", units: 1 },
  { code: "PS11", name: "Physical Science", units: 1 },
  { code: "PEH12", name: "Physical Education and Health 2", units: 1 },
  { code: "MIL12", name: "Media and Information Literacy", units: 1 },
  { code: "CPA12", name: "Contemporary Philippine Arts from the Regions", units: 1 },
  { code: "PHP12", name: "Introduction to the Philosophy of the Human Person", units: 1 },
  { code: "PEH13", name: "Physical Education and Health 3", units: 1 },
  // College — first semester, from the school's posted schedules (seed-data/college-schedule.ts)
  ...COLLEGE_SUBJECTS,
  // College — SAMPLE second-semester subjects. There is no posted schedule for
  // these yet; they are only used for last school year's records.
  { code: "GE102", name: "Readings in Philippine History", units: 3 },
  { code: "GE106", name: "Art Appreciation", units: 3 },
  { code: "PE102", name: "Rhythmic Activities", units: 2 },
  { code: "NSTP102", name: "National Service Training Program 2", units: 3 },
  { code: "IT103", name: "Computer Programming 2", units: 3 },
  { code: "HM102", name: "Philippine Tourism, Geography and Culture", units: 3 },
];

/**
 * Subjects that are placed on the timetable automatically: Senior High (both
 * terms) and the college SECOND semester (sample). College first-semester
 * classes come from the posted schedules instead.
 */
const CURRICULUM: Record<string, Record<number, [string[], string[]]>> = {
  SHS: {
    11: [["OC11", "GM11", "ELS11", "PD11", "UCSP11", "PEH11"], ["RW11", "SP11", "PS11", "PEH12"]],
    12: [["MIL12", "CPA12", "PHP12", "PEH13"], ["PEH13"]],
  },
  IT: { 1: [[], ["GE102", "GE106", "PE102", "NSTP102", "IT103"]] },
  HRS: { 1: [[], ["GE102", "GE106", "PE102", "NSTP102", "HM102"]] },
};

/** Senior High instructors (fictional). College instructors are in seed-data/college-schedule.ts. */
const INSTRUCTORS = [
  { employeeNumber: "FAC-0001", firstName: "Ramon", lastName: "Villareal", subjects: ["OC11", "RW11", "MIL12"] },
  { employeeNumber: "FAC-0002", firstName: "Liza", lastName: "Mercado", subjects: ["UCSP11", "PD11", "PHP12"] },
  { employeeNumber: "FAC-0003", firstName: "Carlo", lastName: "Bautista", subjects: ["GM11", "SP11"] },
  { employeeNumber: "FAC-0004", firstName: "Patricia", lastName: "Gonzales", subjects: ["CPA12"] },
  { employeeNumber: "FAC-0005", firstName: "Eduardo", lastName: "Navarro", subjects: ["ELS11", "PS11"] },
  { employeeNumber: "FAC-0006", firstName: "Grace", lastName: "Domingo", subjects: ["PEH11", "PEH12", "PEH13"] },
];

/** Who teaches the sample college second-semester subjects (college instructor keys). */
const SECOND_SEM_INSTRUCTORS: Record<string, keyof typeof COLLEGE_INSTRUCTORS> = {
  GE102: "T01",
  GE106: "T05",
  PE102: "T02",
  NSTP102: "T03",
  IT103: "T07",
  HM102: "T04",
};

/** Senior High rooms (sample). College rooms are in seed-data/college-schedule.ts. */
const SHS_ROOMS = [
  { code: "SHS-1", name: "Senior High Room 1 (sample)" },
  { code: "SHS-2", name: "Senior High Room 2 (sample)" },
  { code: "SHS-3", name: "Senior High Room 3 (sample)" },
];

/** Weekly time slots (each meets on two days, except Friday/Saturday blocks). */
const SLOT_TEMPLATES: Array<{ days: DayOfWeek[]; start: string; end: string }> = [
  { days: ["MONDAY", "WEDNESDAY"], start: "07:30", end: "09:00" },
  { days: ["MONDAY", "WEDNESDAY"], start: "09:00", end: "10:30" },
  { days: ["MONDAY", "WEDNESDAY"], start: "10:30", end: "12:00" },
  { days: ["MONDAY", "WEDNESDAY"], start: "13:00", end: "14:30" },
  { days: ["TUESDAY", "THURSDAY"], start: "07:30", end: "09:00" },
  { days: ["TUESDAY", "THURSDAY"], start: "09:00", end: "10:30" },
  { days: ["TUESDAY", "THURSDAY"], start: "10:30", end: "12:00" },
  { days: ["TUESDAY", "THURSDAY"], start: "13:00", end: "14:30" },
  { days: ["FRIDAY"], start: "08:00", end: "11:00" },
  { days: ["FRIDAY"], start: "13:00", end: "16:00" },
  { days: ["SATURDAY"], start: "08:00", end: "11:00" },
];

const FIRST_NAMES_M = ["Juan", "Jose", "Mark", "John Paul", "Carlo", "Miguel", "Rafael", "Christian", "Joshua", "Paolo", "Gabriel", "Nathaniel", "Adrian", "Kevin", "Bryan"];
const FIRST_NAMES_F = ["Angela", "Maria Isabel", "Kristine", "Patricia", "Andrea", "Camille", "Jasmine", "Nicole", "Bea", "Erika", "Danica", "Sofia", "Hannah", "Joanna", "Trisha"];
const LAST_NAMES = ["Dela Cruz", "Reyes", "Santos", "Garcia", "Mendoza", "Torres", "Flores", "Gonzales", "Ramos", "Aquino", "Bautista", "Villanueva", "Castillo", "Navarro", "Del Rosario", "Pascual", "Soriano", "Manalo", "Salvador", "Lopez"];
const MIDDLE_NAMES = ["Perez", "Cruz", "Lim", "Tan", "Rivera", "Diaz", "Ocampo", "Marquez", "Agustin", null];
const CITIES = [
  { barangay: "Barangka Ibaba", city: "Mandaluyong City" },
  { barangay: "Plainview", city: "Mandaluyong City" },
  { barangay: "Hulo", city: "Mandaluyong City" },
  { barangay: "Addition Hills", city: "Mandaluyong City" },
  { barangay: "Sta. Mesa", city: "Manila" },
  { barangay: "Pinagbuhatan", city: "Pasig City" },
  { barangay: "Bagong Silang", city: "Quezon City" },
];

/**
 * Stops the seed if the timetable has a clash, using the same rules as the app:
 * same instructor, room (face-to-face only) or section at an overlapping time —
 * except combined classes (same subject, instructor, mode, room and time).
 */
async function assertNoScheduleClashes() {
  const rows = await prisma.classSchedule.findMany({ include: { subject: true, section: true } });
  const problems: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.semesterId !== b.semesterId || a.dayOfWeek !== b.dayOfWeek || !(a.startTime < b.endTime && a.endTime > b.startTime)) continue;
      const combined =
        a.sectionId !== b.sectionId && a.subjectId === b.subjectId && a.instructorId === b.instructorId && a.mode === b.mode && a.roomId === b.roomId && a.startTime === b.startTime && a.endTime === b.endTime;
      if (combined) continue;
      const reasons = [a.instructorId === b.instructorId && "instructor", a.roomId !== null && a.roomId === b.roomId && "room", a.sectionId === b.sectionId && "section"].filter(Boolean);
      if (reasons.length) problems.push(`${a.dayOfWeek} ${a.startTime}: ${a.subject.code} (${a.section.name}) vs ${b.subject.code} (${b.section.name}) — same ${reasons.join(", ")}`);
    }
  }
  if (problems.length) throw new Error(`Schedule clashes in the seed data:\n  ${problems.join("\n  ")}`);
}

// --- Main --------------------------------------------------------------------

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.error("❌ The database already has data. Run `npm run db:reset` to wipe it and seed again.");
    process.exit(1);
  }

  console.log("🌱 Seeding development data...");

  // Roles are created by a migration; settings get their defaults here.
  const roles = {
    ADMIN: await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } }),
    STAFF: await prisma.role.findUniqueOrThrow({ where: { name: "STAFF" } }),
    STUDENT: await prisma.role.findUniqueOrThrow({ where: { name: "STUDENT" } }),
  };
  await prisma.systemSetting.createMany({
    data: [
      { key: "grading", value: DEFAULT_GRADING_CONFIG },
      { key: "grading_by_level", value: DEFAULT_GRADING_BY_LEVEL },
      { key: "cross_enrollment_fee", value: 2500 },
      { key: "student_editable_fields", value: DEFAULT_STUDENT_EDITABLE_FIELDS },
    ],
  });

  // Staff accounts
  const admin = await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      roleId: roles.ADMIN.id,
      staffProfile: { create: { firstName: "System", lastName: "Administrator", position: "IT Administrator" } },
    },
  });
  const demoHash = await hashPassword(DEMO_PASSWORD);
  const registrar = await prisma.user.create({
    data: {
      username: "registrar",
      email: "registrar@school.test",
      passwordHash: demoHash,
      roleId: roles.STAFF.id,
      staffProfile: { create: { firstName: "Maria", lastName: "Santos", position: "Registrar" } },
    },
  });
  const cashier = await prisma.user.create({
    data: {
      username: "cashier",
      email: "cashier@school.test",
      passwordHash: demoHash,
      roleId: roles.STAFF.id,
      staffProfile: { create: { firstName: "Jose", lastName: "Reyes", position: "Accounting Staff" } },
    },
  });

  // Programs, subjects, instructors, rooms
  const programs: Record<string, number> = {};
  for (const program of PROGRAMS) {
    const created = await prisma.program.create({
      data: program,
    });
    programs[program.code] = created.id;
  }

  const subjects: Record<string, { id: number; units: number }> = {};
  for (const subject of SUBJECTS) {
    const created = await prisma.subject.create({ data: subject });
    subjects[subject.code] = { id: created.id, units: subject.units };
  }

  const instructorBySubject: Record<string, number> = {};
  for (const instructor of INSTRUCTORS) {
    const created = await prisma.instructor.create({
      data: {
        employeeNumber: instructor.employeeNumber,
        firstName: instructor.firstName,
        lastName: instructor.lastName,
        email: `${instructor.firstName.toLowerCase()}.${instructor.lastName.toLowerCase()}@school.test`,
      },
    });
    for (const code of instructor.subjects) instructorBySubject[code] = created.id;
  }
  const collegeInstructors: Record<string, number> = {};
  for (const [key, instructor] of Object.entries(COLLEGE_INSTRUCTORS)) {
    const created = await prisma.instructor.create({
      data: { ...instructor, email: `${instructor.firstName.toLowerCase()}.${instructor.lastName.toLowerCase()}@school.test` },
    });
    collegeInstructors[key] = created.id;
  }
  for (const [code, key] of Object.entries(SECOND_SEM_INSTRUCTORS)) instructorBySubject[code] = collegeInstructors[key];

  const roomIds: Record<string, number> = {};
  for (const room of [...SHS_ROOMS, ...COLLEGE_ROOMS]) {
    const created = await prisma.room.create({ data: { ...room, capacity: 40 } });
    roomIds[room.code] = created.id;
  }
  const shsRooms = SHS_ROOMS.map((room) => roomIds[room.code]);
  const collegeRooms = [roomIds["101"], roomIds["102"]];

  // Academic years and terms (2026-2027 First Semester is current)
  const ay2025 = await prisma.academicYear.create({ data: { name: "2025-2026", startDate: date("2025-08-11"), endDate: date("2026-05-22") } });
  // 2026-2027: classes start July 7, 2026 (school announcement). End dates are samples.
  const ay2026 = await prisma.academicYear.create({ data: { name: "2026-2027", startDate: date("2026-07-07"), endDate: date("2027-04-24") } });
  const terms = {
    prev1: await prisma.semester.create({ data: { academicYearId: ay2025.id, name: "First Semester", termNumber: 1, startDate: date("2025-08-11"), endDate: date("2025-12-19") } }),
    prev2: await prisma.semester.create({ data: { academicYearId: ay2025.id, name: "Second Semester", termNumber: 2, startDate: date("2026-01-12"), endDate: date("2026-05-22") } }),
    current: await prisma.semester.create({ data: { academicYearId: ay2026.id, name: "First Semester", termNumber: 1, startDate: date("2026-07-07"), endDate: date("2026-11-28"), isCurrent: true } }),
    next: await prisma.semester.create({ data: { academicYearId: ay2026.id, name: "Second Semester", termNumber: 2, startDate: date("2026-12-07"), endDate: date("2027-04-24") } }),
  };

  // Sections
  // Senior High: "Grade 11-A". College: the posted sections, e.g. "IT 1-A" (afternoon), "IT 1-E" (evening).
  const createSection = (name: string, programCode: string, yearLevel: number, academicYearId: number) =>
    prisma.section.create({ data: { name, programId: programs[programCode], yearLevel, academicYearId } });

  const shsCurrent = [await createSection("Grade 11-A", "SHS", 11, ay2026.id), await createSection("Grade 12-A", "SHS", 12, ay2026.id)];
  const collegeCurrent: Array<Awaited<ReturnType<typeof createSection>>> = [];
  for (const posted of COLLEGE_SCHEDULE) collegeCurrent.push(await createSection(posted.name, posted.program, posted.yearLevel, ay2026.id));
  const currentSections = [...shsCurrent, ...collegeCurrent];
  // Last school year: one section per 1st-year group (today's 2nd years / Grade 12).
  const previousSections = [
    await createSection("Grade 11-A", "SHS", 11, ay2025.id),
    await createSection("IT 1-A", "IT", 1, ay2025.id),
    await createSection("HRS 1-A", "HRS", 1, ay2025.id),
  ];

  // College first semester: exactly as posted.
  async function addPostedClasses(termId: number, sectionId: number, postedName: string) {
    const posted = COLLEGE_SCHEDULE.find((section) => section.name === postedName)!;
    for (const item of posted.classes) {
      await prisma.classSchedule.create({
        data: {
          semesterId: termId,
          subjectId: subjects[item.subject].id,
          sectionId,
          instructorId: collegeInstructors[item.instructor],
          mode: item.room ? "FACE_TO_FACE" : "ONLINE",
          roomId: item.room ? roomIds[item.room] : null,
          dayOfWeek: item.day,
          startTime: item.start,
          endTime: item.end,
        },
      });
    }
  }
  for (const section of collegeCurrent) await addPostedClasses(terms.current.id, section.id, section.name);
  for (const section of previousSections.filter((section) => section.programId !== programs.SHS)) {
    await addPostedClasses(terms.prev1.id, section.id, section.name);
  }

  // Senior High and the sample college 2nd semester: greedy placement that never
  // creates instructor/room/section clashes.
  const busy = new Set<string>();
  const key = (termId: number, kind: string, id: number, day: string, start: string) => `${termId}|${kind}|${id}|${day}|${start}`;

  async function scheduleSection(termId: number, section: { id: number; name: string; programId: number; yearLevel: number }, subjectCodes: string[], roomPool: number[]) {
    for (const code of subjectCodes) {
      const instructorId = instructorBySubject[code];
      let placed = false;
      for (const slot of SLOT_TEMPLATES) {
        const roomId = roomPool.find((room) => slot.days.every((day) => !busy.has(key(termId, "room", room, day, slot.start))));
        const free =
          roomId !== undefined &&
          slot.days.every(
            (day) => !busy.has(key(termId, "section", section.id, day, slot.start)) && !busy.has(key(termId, "instructor", instructorId, day, slot.start)),
          );
        if (!free) continue;

        for (const day of slot.days) {
          busy.add(key(termId, "room", roomId, day, slot.start));
          busy.add(key(termId, "section", section.id, day, slot.start));
          busy.add(key(termId, "instructor", instructorId, day, slot.start));
          await prisma.classSchedule.create({
            data: { semesterId: termId, subjectId: subjects[code].id, sectionId: section.id, instructorId, roomId, dayOfWeek: day, startTime: slot.start, endTime: slot.end },
          });
        }
        placed = true;
        break;
      }
      if (!placed) throw new Error(`Could not place ${code} for ${section.name}`);
    }
  }

  const programCodeById = Object.fromEntries(Object.entries(programs).map(([code, id]) => [id, code]));
  const curriculumFor = (section: { programId: number; yearLevel: number }, termNumber: 1 | 2) =>
    CURRICULUM[programCodeById[section.programId]]?.[section.yearLevel]?.[termNumber - 1] ?? [];

  for (const section of shsCurrent) await scheduleSection(terms.current.id, section, curriculumFor(section, 1), shsRooms);
  for (const section of previousSections) {
    const isShs = section.programId === programs.SHS;
    if (isShs) await scheduleSection(terms.prev1.id, section, curriculumFor(section, 1), shsRooms);
    await scheduleSection(terms.prev2.id, section, curriculumFor(section, 2), isShs ? shsRooms : collegeRooms);
  }
  await assertNoScheduleClashes();

  // Students -------------------------------------------------------------------
  interface SeedStudent {
    number: string;
    first: string;
    middle: string | null;
    last: string;
    sex: "MALE" | "FEMALE";
    birth: string;
    program: string;
    yearLevel: number;
    currentStatus: "ENROLLED" | "PENDING" | null;
    account: "temporary" | "changed" | null;
    archived?: boolean;
  }

  const students: SeedStudent[] = [
    // Featured demo students
    { number: "2026-0001", first: "Juan", middle: "Perez", last: "Dela Cruz", sex: "MALE", birth: "2008-01-01", program: "IT", yearLevel: 1, currentStatus: "ENROLLED", account: "temporary" },
    { number: "2025-0001", first: "Angela", middle: "Cruz", last: "Reyes", sex: "FEMALE", birth: "2007-06-14", program: "IT", yearLevel: 2, currentStatus: "ENROLLED", account: "changed" },
    { number: "2025-0002", first: "Mark", middle: "Lim", last: "Santos", sex: "MALE", birth: "2009-03-08", program: "SHS", yearLevel: 12, currentStatus: "ENROLLED", account: "changed" },
  ];

  const plan: Array<{ program: string; yearLevel: number; count: number }> = [
    { program: "SHS", yearLevel: 11, count: 6 },
    { program: "SHS", yearLevel: 12, count: 4 },
    { program: "IT", yearLevel: 1, count: 6 },
    { program: "IT", yearLevel: 2, count: 4 },
    { program: "HRS", yearLevel: 1, count: 5 },
    { program: "HRS", yearLevel: 2, count: 4 },
  ];
  const counters: Record<number, number> = { 2025: 2, 2026: 1 };
  /** 2nd year / Grade 12 students started a year earlier. */
  const isSecondYear = (yearLevel: number) => yearLevel === 2 || yearLevel === 12;
  const usedNames = new Set(students.map((student) => `${student.first} ${student.last}`));

  for (const group of plan) {
    for (let i = 0; i < group.count; i++) {
      const sex = random() < 0.5 ? "MALE" : "FEMALE";
      let first: string;
      let last: string;
      do {
        first = pick(sex === "MALE" ? FIRST_NAMES_M : FIRST_NAMES_F);
        last = pick(LAST_NAMES);
      } while (usedNames.has(`${first} ${last}`));
      usedNames.add(`${first} ${last}`);

      const entryYear = isSecondYear(group.yearLevel) ? 2025 : 2026;
      counters[entryYear] += 1;
      const birthYear = entryYear - (group.program === "SHS" ? 16 : 18) - (random() < 0.3 ? 1 : 0);
      const month = String(1 + Math.floor(random() * 12)).padStart(2, "0");
      const day = String(1 + Math.floor(random() * 28)).padStart(2, "0");
      students.push({
        number: `${entryYear}-${String(counters[entryYear]).padStart(4, "0")}`,
        first,
        middle: pick(MIDDLE_NAMES),
        last,
        sex,
        birth: `${birthYear}-${month}-${day}`,
        program: group.program,
        yearLevel: group.yearLevel,
        currentStatus: random() < 0.15 ? "PENDING" : "ENROLLED",
        account: random() < 0.4 ? (random() < 0.5 ? "temporary" : "changed") : null,
      });
    }
  }
  // A graduated-style archived record and a new applicant with no section yet.
  students.push({ number: "2025-0099", first: "Paolo", middle: null, last: "Soriano", sex: "MALE", birth: "2006-09-02", program: "HRS", yearLevel: 2, currentStatus: null, account: null, archived: true });
  students.push({ number: "2026-0099", first: "Hannah", middle: "Diaz", last: "Manalo", sex: "FEMALE", birth: "2008-04-22", program: "HRS", yearLevel: 1, currentStatus: "PENDING", account: null });

  /** Spreads students over the sections of their program + year, in order (first student -> first section). */
  const sectionTurns = new Map<string, number>();
  const sectionFor = (programCode: string, yearLevel: number, sections: typeof currentSections) => {
    const options = sections.filter((section) => section.programId === programs[programCode] && section.yearLevel === yearLevel);
    if (options.length === 0) return undefined;
    const turnKey = `${options[0].academicYearId}-${programCode}-${yearLevel}`;
    const turn = sectionTurns.get(turnKey) ?? 0;
    sectionTurns.set(turnKey, turn + 1);
    return options[turn % options.length];
  };

  // The school's "Tuition Fee Options" (₱320 per unit + ₱2,500 miscellaneous).
  // Final payment = whatever remains. Senior High: ₱25,000 per school year, free with a voucher.
  const FEE_MATRIX = [
    { program: "IT", yearLevel: 1, units: 23, prelim: 2870, midterm: 2870 },
    { program: "HRS", yearLevel: 1, units: 23, prelim: 2870, midterm: 2870 },
    { program: "IT", yearLevel: 2, units: 24, prelim: 2810, midterm: 2810 },
    { program: "HRS", yearLevel: 2, units: 21, prelim: 2657, midterm: 2657 },
  ];
  const breakdowns: Record<string, FeeBreakdown> = {};
  for (const row of FEE_MATRIX) {
    const schedule = await prisma.feeSchedule.create({
      data: {
        programId: programs[row.program],
        yearLevel: row.yearLevel,
        units: row.units,
        ratePerUnit: 320,
        miscFee: 2500,
        downPayment: 2000,
        prelimPayment: row.prelim,
        midtermPayment: row.midterm,
        earlyBirdDiscount: 1000,
        cashDiscount: 500,
      },
    });
    breakdowns[`${row.program}-${row.yearLevel}`] = toBreakdown(schedule);
  }
  for (const yearLevel of [11, 12]) {
    const schedule = await prisma.feeSchedule.create({ data: { programId: programs.SHS, yearLevel, annualTuition: 25000 } });
    breakdowns[`SHS-${yearLevel}`] = toBreakdown(schedule);
  }

  /** College students pick a payment option per term; most pay in installments. */
  const collegePlan = (): PaymentPlan => {
    const roll = random();
    return roll < 0.7 ? "INSTALLMENT" : roll < 0.85 ? "EARLY_BIRD" : "CASH";
  };
  const METHODS: PaymentMethod[] = ["CASH", "CASH", "GCASH", "BANK_TRANSFER", "MAYA"];
  let receipt = 1000;
  const nextReceipt = (year: number) => `OR-${year}-${String(++receipt).padStart(5, "0")}`;

  /** Senior High uses 60–100 (75 passing); college uses 1.00–5.00 (3.00 passing). */
  function randomGrade(seniorHigh: boolean): { grade: number | null; remark: GradeRemark } {
    const roll = random();
    if (roll < 0.03) return { grade: null, remark: "INCOMPLETE" };
    if (seniorHigh) {
      if (roll < 0.06) return { grade: 70 + Math.floor(random() * 5), remark: "FAILED" };
      return { grade: 78 + Math.floor(random() * 20), remark: "PASSED" };
    }
    if (roll < 0.06) return { grade: 5, remark: "FAILED" };
    const options = [1.25, 1.5, 1.5, 1.75, 1.75, 2, 2, 2.25, 2.25, 2.5, 2.75, 3];
    return { grade: pick(options), remark: "PASSED" };
  }
  const allSections = [...currentSections, ...previousSections];
  const isSeniorHighSection = (sectionId: number) => allSections.some((section) => section.id === sectionId && section.programId === programs.SHS);

  /** Creates the enrollment and (if a plan is given) its tuition charges. Returns the total charged. */
  async function enroll(
    studentId: number,
    termId: number,
    programCode: string,
    yearLevel: number,
    sectionId: number | null,
    status: "ENROLLED" | "PENDING" | "COMPLETED",
    enrollmentDate: string,
    plan: PaymentPlan | null,
    options: { annualAlreadyCharged?: boolean } = {},
  ) {
    const breakdown = breakdowns[`${programCode}-${yearLevel}`];
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId,
        semesterId: termId,
        programId: programs[programCode],
        yearLevel,
        sectionId,
        status,
        enrollmentDate: date(enrollmentDate),
        createdById: registrar.id,
        paymentPlan: plan,
        feeBreakdown: plan ? { ...breakdown } : undefined,
      },
    });
    let total = 0;
    if (plan) {
      for (const line of buildFeeLines(breakdown, plan, options)) {
        await prisma.tuitionAssessment.create({ data: { enrollmentId: enrollment.id, description: line.description, amount: line.amount, createdById: cashier.id } });
        total += Number(line.amount);
      }
    }
    return { enrollment, total, breakdown };
  }

  async function pay(enrollmentId: number, amount: number, paidOn: string, remarks?: string) {
    if (amount <= 0) return;
    await prisma.payment.create({
      data: { enrollmentId, referenceNumber: nextReceipt(Number(paidOn.slice(0, 4))), amount, paymentDate: date(paidOn), paymentMethod: pick(METHODS), recordedById: cashier.id, remarks },
    });
  }

  /** Installment payments in order: down, prelim, midterm, final (= rest). */
  function installmentAmounts(breakdown: FeeBreakdown, total: number) {
    const final = total - breakdown.downPayment - breakdown.prelimPayment - breakdown.midtermPayment;
    return [breakdown.downPayment, breakdown.prelimPayment, breakdown.midtermPayment, final];
  }

  async function addGrades(enrollmentId: number, termId: number, sectionId: number, status: "DRAFT" | "PUBLISHED", publishedAt?: string) {
    const offerings = await prisma.classSchedule.findMany({ where: { semesterId: termId, sectionId }, distinct: ["subjectId"] });
    for (const offering of offerings) {
      const { grade, remark } = randomGrade(isSeniorHighSection(sectionId));
      await prisma.grade.create({
        data: {
          enrollmentId,
          subjectId: offering.subjectId,
          instructorId: offering.instructorId,
          grade,
          remark,
          status,
          encodedById: registrar.id,
          encodedAt: publishedAt ? date(publishedAt) : new Date(),
          publishedById: status === "PUBLISHED" ? registrar.id : null,
          publishedAt: status === "PUBLISHED" && publishedAt ? date(publishedAt) : null,
        },
      });
    }
  }

  let accountsCreated = 0;
  const studentHash = await hashPassword(DEMO_PASSWORD);

  for (const seed of students) {
    const location = pick(CITIES);
    const student = await prisma.student.create({
      data: {
        studentNumber: seed.number,
        firstName: seed.first,
        middleName: seed.middle,
        lastName: seed.last,
        dateOfBirth: date(seed.birth),
        sex: seed.sex,
        programId: programs[seed.program],
        status: seed.archived ? "ARCHIVED" : "ACTIVE",
        archivedAt: seed.archived ? date("2026-06-15") : null,
        profile: {
          create: {
            email: `${seed.first.split(" ")[0].toLowerCase()}.${seed.last.replace(/\s/g, "").toLowerCase()}@student.school.test`,
            contactNumber: `0917${String(Math.floor(random() * 10_000_000)).padStart(7, "0")}`,
            addressLine: `${10 + Math.floor(random() * 990)} Sample Street`,
            barangay: location.barangay,
            city: location.city,
            province: "Metro Manila",
            zipCode: "1550",
            guardianName: `${pick(FIRST_NAMES_F)} ${seed.last}`,
            guardianRelationship: pick(["Mother", "Father", "Guardian"]),
            guardianContactNumber: `0918${String(Math.floor(random() * 10_000_000)).padStart(7, "0")}`,
          },
        },
      },
    });

    // Portal account
    if (seed.account && !seed.archived) {
      const user = await prisma.user.create({
        data: {
          username: seed.number,
          email: `${seed.number}@student.school.test`,
          passwordHash: seed.account === "temporary" ? await hashPassword(birthdatePassword(date(seed.birth))) : studentHash,
          roleId: roles.STUDENT.id,
          mustChangePassword: seed.account === "temporary",
          passwordChangedAt: seed.account === "changed" ? date("2026-08-12") : null,
        },
      });
      await prisma.student.update({ where: { id: student.id }, data: { userId: user.id } });
      accountsCreated++;
    }

    // Senior High voucher status stays the same for the student.
    const shsPlan: PaymentPlan = random() < 0.5 ? "SHS_VOUCHER" : "SHS_NO_VOUCHER";
    const planFor = () => (seed.program === "SHS" ? shsPlan : collegePlan());

    // 2nd-years / Grade 12 have last year's records: completed, published and fully paid.
    if (isSecondYear(seed.yearLevel)) {
      const previousLevel = seed.yearLevel - 1;
      const section = sectionFor(seed.program, previousLevel, previousSections);
      if (section) {
        for (const [term, enrolledOn, publishedOn, paidOn, termIndex] of [
          [terms.prev1, "2025-08-04", "2025-12-22", ["2025-08-04", "2025-09-15", "2025-10-20", "2025-12-01"], 0],
          [terms.prev2, "2026-01-05", "2026-05-27", ["2026-01-05", "2026-02-16", "2026-03-23", "2026-05-04"], 1],
        ] as const) {
          const plan = planFor();
          const { enrollment, total, breakdown } = await enroll(student.id, term.id, seed.program, previousLevel, section.id, "COMPLETED", enrolledOn, plan, {
            annualAlreadyCharged: termIndex === 1, // Senior High: whole-year tuition charged in the 1st term
          });
          await addGrades(enrollment.id, term.id, section.id, "PUBLISHED", publishedOn);
          if (plan === "INSTALLMENT") {
            const amounts = installmentAmounts(breakdown, total);
            for (let i = 0; i < amounts.length; i++) await pay(enrollment.id, amounts[i], paidOn[i]);
          } else if (plan === "SHS_NO_VOUCHER") {
            await pay(enrollment.id, total / 2, paidOn[0]);
            await pay(enrollment.id, total / 2, "2026-01-05");
          } else {
            await pay(enrollment.id, total, paidOn[0], plan === "EARLY_BIRD" ? "Early bird payment" : "Cash payment");
          }
        }
      }
    }

    // Current term
    if (seed.currentStatus) {
      const section = seed.currentStatus === "ENROLLED" ? sectionFor(seed.program, seed.yearLevel, currentSections) : undefined;
      const enrolledOn = seed.currentStatus === "PENDING" ? "2026-09-25" : "2026-06-29";
      // Pending applicants have no fees yet (staff applies them from the enrollment).
      const plan = seed.currentStatus === "ENROLLED" ? planFor() : null;
      const { enrollment, total, breakdown } = await enroll(student.id, terms.current.id, seed.program, seed.yearLevel, section?.id ?? null, seed.currentStatus, enrolledOn, plan);

      if (plan === "INSTALLMENT") {
        const [down, prelim] = installmentAmounts(breakdown, total);
        await pay(enrollment.id, down, "2026-06-29", "Down payment");
        if (random() < 0.6) await pay(enrollment.id, prelim, "2026-08-17", "Prelim exam payment");
      } else if (plan === "EARLY_BIRD") {
        await pay(enrollment.id, total, "2026-06-05", "Early bird payment");
      } else if (plan === "CASH") {
        await pay(enrollment.id, total, "2026-07-06", "Cash payment");
      } else if (plan === "SHS_NO_VOUCHER") {
        await pay(enrollment.id, 10000, "2026-06-29");
      }
    }
  }

  // Draft grades for one current class (to demonstrate review + publishing).
  const it1 = currentSections.find((section) => section.name === "IT 1-A")!;
  const it101 = subjects.IT101.id;
  const it1Enrollments = await prisma.enrollment.findMany({ where: { semesterId: terms.current.id, sectionId: it1.id, status: "ENROLLED" } });
  const it101Offering = await prisma.classSchedule.findFirst({ where: { semesterId: terms.current.id, sectionId: it1.id, subjectId: it101 } });
  for (const enrollment of it1Enrollments) {
    const { grade, remark } = randomGrade(false);
    await prisma.grade.create({
      data: { enrollmentId: enrollment.id, subjectId: it101, instructorId: it101Offering?.instructorId, grade, remark, status: "DRAFT", encodedById: registrar.id },
    });
  }

  // One voided payment (shows how corrections work).
  const someEnrollment = it1Enrollments[0];
  if (someEnrollment) {
    await prisma.payment.create({
      data: {
        enrollmentId: someEnrollment.id,
        referenceNumber: nextReceipt(2026),
        amount: 2000,
        paymentDate: date("2026-06-29"),
        paymentMethod: "CASH",
        recordedById: cashier.id,
        status: "VOIDED",
        voidReason: "Duplicate entry — same receipt was encoded twice.",
        voidedById: cashier.id,
        voidedAt: date("2026-06-30"),
      },
    });
  }

  // Irregular student: Angela (IT 2-A) failed IT102 last year and retakes it
  // with IT 1-E (Wednesday 7:30 PM, online) on top of her own section's classes.
  // IT 1-A's IT102 (Thursday 6:00 PM) would clash with her FIL102.
  const it1Evening = currentSections.find((section) => section.name === "IT 1-E")!;
  const angela = await prisma.student.findUniqueOrThrow({ where: { studentNumber: "2025-0001" } });
  const angelaPrevious = await prisma.enrollment.findFirst({ where: { studentId: angela.id, semesterId: terms.prev1.id } });
  if (angelaPrevious) {
    await prisma.grade.updateMany({ where: { enrollmentId: angelaPrevious.id, subjectId: subjects.IT102.id }, data: { grade: 5, remark: "FAILED" } });
  }
  const angelaCurrent = await prisma.enrollment.findFirst({ where: { studentId: angela.id, semesterId: terms.current.id } });
  if (angelaCurrent) {
    await prisma.enrollmentSubject.create({ data: { enrollmentId: angelaCurrent.id, sectionId: it1Evening.id, subjectId: subjects.IT102.id, createdById: registrar.id } });
    await prisma.tuitionAssessment.create({ data: { enrollmentId: angelaCurrent.id, description: "Cross Enrollment Fee — IT102 (cash basis)", amount: 2500, createdById: cashier.id } });
    await pay(angelaCurrent.id, 2500, "2026-07-06", "Cross enrollment fee (cash)");
  }

  // A published INCOMPLETE grade (staff can complete it with "Complete INC").
  const juan = await prisma.student.findUniqueOrThrow({ where: { studentNumber: "2026-0001" } });
  const juanCurrent = await prisma.enrollment.findFirst({ where: { studentId: juan.id, semesterId: terms.current.id } });
  const ge105Offering = await prisma.classSchedule.findFirst({ where: { semesterId: terms.current.id, sectionId: it1.id, subjectId: subjects.GE105.id } });
  if (juanCurrent && ge105Offering) {
    await prisma.grade.create({
      data: {
        enrollmentId: juanCurrent.id,
        subjectId: subjects.GE105.id,
        instructorId: ge105Offering.instructorId,
        grade: null,
        remark: "INCOMPLETE",
        status: "PUBLISHED",
        encodedById: registrar.id,
        publishedById: registrar.id,
        publishedAt: date("2026-09-30"),
      },
    });
  }

  // Admission requirements (Form 137, Diploma, Form 138, Good Moral).
  // Returning students are complete; new students are at different stages.
  const requirementTypes = await prisma.requirementType.findMany({ orderBy: { sortOrder: "asc" } });
  const allStudents = await prisma.student.findMany({ where: { status: "ACTIVE" } });
  for (const student of allStudents) {
    const returning = student.studentNumber.startsWith("2025-");
    for (const type of requirementTypes) {
      const roll = random();
      const status = returning || roll < 0.55 ? "VERIFIED" : roll < 0.75 ? "SUBMITTED" : "PENDING";
      if (status === "PENDING") continue; // no row = not yet submitted
      await prisma.studentRequirement.create({
        data: {
          studentId: student.id,
          requirementTypeId: type.id,
          status,
          submittedDate: date(returning ? "2025-07-28" : "2026-07-27"),
          updatedById: registrar.id,
        },
      });
    }
  }

  // Announcements (sample content)
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  await prisma.announcement.createMany({
    data: [
      {
        title: "Second Semester enrollment schedule",
        content: "Sample announcement for development.\n\nThe enrollment schedule for the Second Semester of A.Y. 2026-2027 will be posted here by the Registrar's Office.",
        audience: "PUBLIC",
        status: "PUBLISHED",
        publishDate: daysAgo(2),
        createdById: registrar.id,
      },
      {
        title: "Student Portal now available",
        content: "Sample announcement for development.\n\nStudents can now view their grades, class schedule and balance online. Log in with your student number; you will be asked to change your temporary password on first login.",
        audience: "PUBLIC",
        status: "PUBLISHED",
        publishDate: daysAgo(10),
        createdById: admin.id,
      },
      {
        title: "Reminder: settle your second installment",
        content: "Sample announcement for development.\n\nPlease check Balance & Payments in the Student Portal for your remaining balance. Payments are accepted at the Accounting Office.",
        audience: "STUDENTS",
        status: "PUBLISHED",
        publishDate: daysAgo(5),
        createdById: cashier.id,
      },
      {
        title: "Library hours during midterm week",
        content: "Sample announcement for development.\n\nExtended library hours will be announced here.",
        audience: "PUBLIC",
        status: "PUBLISHED",
        publishDate: daysAgo(20),
        createdById: registrar.id,
      },
      {
        title: "Foundation Day activities (draft)",
        content: "Draft — not visible to the public until published.",
        audience: "PUBLIC",
        status: "DRAFT",
        publishDate: now,
        createdById: registrar.id,
      },
    ],
  });
  // Sample announcements count as already emailed (only new ones are sent to students).
  await prisma.announcement.updateMany({ where: { status: "PUBLISHED" }, data: { emailedAt: now } });
  // Sample cover photos (CC0, see seed-data/announcement-photos/CREDITS.md).
  await attachSamplePhotos(prisma);

  // A few audit entries so the audit log screen has context on first open.
  await prisma.auditLog.createMany({
    data: [
      { userId: admin.id, action: "SETTINGS_UPDATED", entityType: "system", description: "Development database seeded with sample data" },
      { userId: registrar.id, action: "GRADE_CREATED", entityType: "grade_sheet", description: "Saved draft grades for IT101 — IT 1-A (sample)" },
    ],
  });

  console.log(`✅ Seed complete: ${students.length} students (${accountsCreated} with portal accounts).`);
  console.log("");
  console.log("   Admin login     :", ADMIN_USERNAME, "/ (SEED_ADMIN_PASSWORD from .env)");
  console.log("   Staff logins    : registrar, cashier / (SEED_DEMO_PASSWORD from .env)");
  console.log("   Student (temp)  : 2026-0001 / 01012008  (Juan Dela Cruz — must change password)");
  console.log("   Student (ready) : 2025-0001 / (SEED_DEMO_PASSWORD)  (Angela Reyes — IT 2nd year, irregular, has grade history)");
  console.log("   Student (SHS)   : 2025-0002 / (SEED_DEMO_PASSWORD)  (Mark Santos — Grade 12)");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
