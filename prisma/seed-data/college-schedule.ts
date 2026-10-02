// =============================================================================
// COLLEGE CLASS SCHEDULE — First Semester, School Year 2026-2027
//
// Copied from the school's posted schedules (classes start July 7, 2026):
// subjects, units, days, times, face-to-face/online and rooms are as posted.
// Instructor names are FICTIONAL stand-ins (one fictional name per real
// teacher, so who-teaches-what stays realistic). Enter the real names in
// Admin → Settings → Instructors.
//
// Section letters: M = morning, A = afternoon, E = evening.
// Combined classes: when two sections have the same subject, instructor,
// room and time (e.g. IT 2-A and IT 2-E for IT104), they meet together.
//
// Changes from the posters (please confirm with the Registrar):
//   1. IT 1-E Thursday: the poster has GE107 at 6:00 and GE103 at 7:30, the
//      reverse of HRS 1-E — with the same teacher and room 101 at the same
//      time. Here IT 1-E follows HRS 1-E (GE103 first), so they are combined.
//   2. HRS 2-E Thursday (HM105, HRM107) is in room 102: the poster's room 101
//      is already used by HRS 1-E / IT 1-E at that time.
//   3. Housekeeping Operations: the code and room were hidden on the poster.
//      The code is shown here as HRM105 and the room as HK-LAB (sample).
// =============================================================================
import type { DayOfWeek } from "../../src/generated/prisma/client";

export interface CollegeSubject {
  code: string;
  name: string;
  units: number;
}

/** Subjects on the posters (first semester). */
export const COLLEGE_SUBJECTS: CollegeSubject[] = [
  // 1st year — both IT and HRS
  { code: "GE101", name: "Understanding the Self", units: 3 },
  { code: "PE101", name: "Gymnastics", units: 2 },
  { code: "GE103", name: "Mathematics in the Modern World", units: 3 },
  { code: "GE105", name: "Purposive Communication", units: 3 },
  { code: "GE107", name: "Science, Technology and Society", units: 3 },
  { code: "NSTP101", name: "National Service Training Program 1", units: 3 },
  // 1st year — IT
  { code: "IT101", name: "Introduction to Computing", units: 3 },
  { code: "IT102", name: "C Programming", units: 3 },
  // 1st year — HRS (HM105 is also taken in 2nd year, as posted)
  { code: "HM101", name: "Risk Management as Applied to Safety, Security and Sanitation", units: 3 },
  { code: "HM105", name: "Macro Perspective of Hospitality", units: 3 },
  // 2nd year — both IT and HRS
  { code: "PE104", name: "Team Sports", units: 2 },
  { code: "GE108", name: "Ethics", units: 3 },
  { code: "FIL102", name: "Panitikang Filipino", units: 3 },
  // 2nd year — IT
  { code: "IT104", name: "Data Structures and Algorithms", units: 3 },
  { code: "IT105", name: "Information Management", units: 4 },
  { code: "IT111", name: "System Integration and Architecture 1", units: 3 },
  { code: "IT112", name: "Quantitative Methods", units: 3 },
  { code: "IT114", name: "Information Assurance and Security 1", units: 3 },
  // 2nd year — HRS
  { code: "HRM105", name: "Housekeeping Operations", units: 4 },
  { code: "HRM107", name: "Front Office Operations", units: 3 },
  { code: "HRM117", name: "Rooms Division Management", units: 3 },
];

/** Fictional instructors (T01 … T12 = one per teacher on the posters). */
export const COLLEGE_INSTRUCTORS: Record<string, { employeeNumber: string; firstName: string; lastName: string }> = {
  T01: { employeeNumber: "FAC-0101", firstName: "Ramil", lastName: "Salonga" },
  T02: { employeeNumber: "FAC-0102", firstName: "Edwin", lastName: "Javier" },
  T03: { employeeNumber: "FAC-0103", firstName: "Nora", lastName: "Cabrera" },
  T04: { employeeNumber: "FAC-0104", firstName: "Liza", lastName: "Montano" },
  T05: { employeeNumber: "FAC-0105", firstName: "Bryan", lastName: "Miranda" },
  T06: { employeeNumber: "FAC-0106", firstName: "Mika", lastName: "Santiago" },
  T07: { employeeNumber: "FAC-0107", firstName: "Marco", lastName: "Dizon" },
  T08: { employeeNumber: "FAC-0108", firstName: "Ernesto", lastName: "Tolentino" },
  T09: { employeeNumber: "FAC-0109", firstName: "Federico", lastName: "Galang" },
  T10: { employeeNumber: "FAC-0110", firstName: "Paulo", lastName: "Manalastas" },
  T11: { employeeNumber: "FAC-0111", firstName: "Alvin", lastName: "Vergara" },
  T12: { employeeNumber: "FAC-0112", firstName: "Joy", lastName: "Valdez" },
};

/** College rooms on the posters (HK-LAB is a sample — the real room was hidden). */
export const COLLEGE_ROOMS: Array<{ code: string; name: string }> = [
  { code: "101", name: "Room 101" },
  { code: "102", name: "Room 102" },
  { code: "204", name: "Room 204" },
  { code: "205", name: "Room 205" },
  { code: "HK-LAB", name: "Housekeeping Laboratory (sample)" },
];

export interface PostedClass {
  subject: string;
  day: DayOfWeek;
  start: string; // "HH:MM", 24-hour
  end: string;
  /** Room code, or null for an ONLINE class. */
  room: string | null;
  instructor: keyof typeof COLLEGE_INSTRUCTORS;
}

export interface PostedSection {
  program: "IT" | "HRS";
  yearLevel: 1 | 2;
  name: string;
  shift: "Morning" | "Afternoon" | "Evening";
  classes: PostedClass[];
}

const online = null;

export const COLLEGE_SCHEDULE: PostedSection[] = [
  // --- Information Technology ------------------------------------------------
  {
    program: "IT",
    yearLevel: 1,
    name: "IT 1-A",
    shift: "Afternoon",
    classes: [
      { subject: "PE101", day: "MONDAY", start: "13:00", end: "14:30", room: "101", instructor: "T02" },
      { subject: "GE101", day: "MONDAY", start: "14:30", end: "16:00", room: "101", instructor: "T01" },
      { subject: "GE107", day: "TUESDAY", start: "13:00", end: "14:30", room: "101", instructor: "T05" },
      { subject: "GE103", day: "TUESDAY", start: "14:30", end: "16:00", room: "101", instructor: "T05" },
      { subject: "GE105", day: "WEDNESDAY", start: "13:00", end: "14:30", room: "101", instructor: "T06" },
      { subject: "NSTP101", day: "WEDNESDAY", start: "14:30", end: "16:00", room: "101", instructor: "T06" },
      { subject: "IT101", day: "THURSDAY", start: "16:00", end: "17:30", room: online, instructor: "T07" },
      { subject: "IT102", day: "THURSDAY", start: "18:00", end: "19:30", room: online, instructor: "T07" },
    ],
  },
  {
    program: "IT",
    yearLevel: 1,
    name: "IT 1-E",
    shift: "Evening",
    classes: [
      { subject: "GE101", day: "MONDAY", start: "18:00", end: "19:30", room: "101", instructor: "T01" },
      { subject: "PE101", day: "MONDAY", start: "19:30", end: "21:00", room: "101", instructor: "T02" },
      { subject: "GE105", day: "TUESDAY", start: "18:00", end: "19:30", room: "101", instructor: "T03" },
      { subject: "NSTP101", day: "TUESDAY", start: "19:30", end: "21:00", room: "101", instructor: "T03" },
      { subject: "IT101", day: "WEDNESDAY", start: "18:00", end: "19:30", room: online, instructor: "T07" },
      { subject: "IT102", day: "WEDNESDAY", start: "19:30", end: "21:00", room: online, instructor: "T07" },
      // Poster order was GE107 then GE103 (see note 1 at the top).
      { subject: "GE103", day: "THURSDAY", start: "18:00", end: "19:30", room: "101", instructor: "T05" },
      { subject: "GE107", day: "THURSDAY", start: "19:30", end: "21:00", room: "101", instructor: "T05" },
    ],
  },
  {
    program: "IT",
    yearLevel: 2,
    name: "IT 2-A",
    shift: "Afternoon",
    classes: [
      { subject: "IT104", day: "MONDAY", start: "16:00", end: "17:30", room: "204", instructor: "T07" },
      { subject: "IT114", day: "MONDAY", start: "18:00", end: "19:30", room: "204", instructor: "T07" },
      { subject: "PE104", day: "TUESDAY", start: "13:00", end: "14:30", room: "205", instructor: "T02" },
      { subject: "GE108", day: "TUESDAY", start: "14:30", end: "16:00", room: "205", instructor: "T01" },
      { subject: "IT105", day: "WEDNESDAY", start: "16:00", end: "17:30", room: online, instructor: "T08" },
      { subject: "FIL102", day: "THURSDAY", start: "18:00", end: "19:30", room: online, instructor: "T09" },
      { subject: "IT111", day: "SATURDAY", start: "13:00", end: "14:30", room: "204", instructor: "T10" },
      { subject: "IT112", day: "SATURDAY", start: "14:30", end: "16:00", room: "204", instructor: "T10" },
    ],
  },
  {
    program: "IT",
    yearLevel: 2,
    name: "IT 2-E",
    shift: "Evening",
    classes: [
      { subject: "IT104", day: "MONDAY", start: "16:00", end: "17:30", room: "204", instructor: "T07" },
      { subject: "IT114", day: "MONDAY", start: "18:00", end: "19:30", room: "204", instructor: "T07" },
      { subject: "PE104", day: "TUESDAY", start: "18:00", end: "19:30", room: "204", instructor: "T02" },
      { subject: "GE108", day: "TUESDAY", start: "19:30", end: "21:00", room: "204", instructor: "T01" },
      { subject: "IT105", day: "WEDNESDAY", start: "16:00", end: "17:30", room: online, instructor: "T08" },
      { subject: "FIL102", day: "FRIDAY", start: "18:00", end: "19:30", room: online, instructor: "T09" },
      { subject: "IT111", day: "SATURDAY", start: "13:00", end: "14:30", room: "204", instructor: "T10" },
      { subject: "IT112", day: "SATURDAY", start: "14:30", end: "16:00", room: "204", instructor: "T10" },
    ],
  },

  // --- Hotel and Restaurant Services ------------------------------------------
  {
    program: "HRS",
    yearLevel: 1,
    name: "HRS 1-M",
    shift: "Morning",
    classes: [
      { subject: "GE101", day: "MONDAY", start: "10:00", end: "11:30", room: "101", instructor: "T01" },
      { subject: "PE101", day: "MONDAY", start: "11:30", end: "13:00", room: "101", instructor: "T02" },
      { subject: "GE105", day: "TUESDAY", start: "10:00", end: "11:30", room: "101", instructor: "T03" },
      { subject: "NSTP101", day: "TUESDAY", start: "11:30", end: "13:00", room: "101", instructor: "T03" },
      { subject: "HM101", day: "WEDNESDAY", start: "10:00", end: "11:30", room: "101", instructor: "T04" },
      { subject: "HM105", day: "WEDNESDAY", start: "11:30", end: "13:00", room: "101", instructor: "T04" },
      { subject: "GE107", day: "THURSDAY", start: "10:00", end: "11:30", room: "101", instructor: "T05" },
      { subject: "GE103", day: "THURSDAY", start: "11:30", end: "13:00", room: "101", instructor: "T05" },
    ],
  },
  {
    program: "HRS",
    yearLevel: 1,
    name: "HRS 1-A",
    shift: "Afternoon",
    classes: [
      { subject: "GE101", day: "MONDAY", start: "13:00", end: "14:30", room: "102", instructor: "T01" },
      { subject: "PE101", day: "MONDAY", start: "14:30", end: "16:00", room: "102", instructor: "T02" },
      { subject: "GE105", day: "TUESDAY", start: "13:00", end: "14:30", room: "102", instructor: "T03" },
      { subject: "NSTP101", day: "TUESDAY", start: "14:30", end: "16:00", room: "102", instructor: "T03" },
      { subject: "HM101", day: "WEDNESDAY", start: "13:00", end: "14:30", room: "102", instructor: "T04" },
      { subject: "HM105", day: "WEDNESDAY", start: "14:30", end: "16:00", room: "102", instructor: "T04" },
      { subject: "GE107", day: "THURSDAY", start: "13:00", end: "14:30", room: "102", instructor: "T05" },
      { subject: "GE103", day: "THURSDAY", start: "14:30", end: "16:00", room: "102", instructor: "T05" },
    ],
  },
  {
    program: "HRS",
    yearLevel: 1,
    name: "HRS 1-E",
    shift: "Evening",
    classes: [
      { subject: "GE101", day: "MONDAY", start: "18:00", end: "19:30", room: "101", instructor: "T01" },
      { subject: "PE101", day: "MONDAY", start: "19:30", end: "21:00", room: "101", instructor: "T02" },
      { subject: "GE105", day: "TUESDAY", start: "18:00", end: "19:30", room: "101", instructor: "T03" },
      { subject: "NSTP101", day: "TUESDAY", start: "19:30", end: "21:00", room: "101", instructor: "T03" },
      { subject: "HM101", day: "WEDNESDAY", start: "18:00", end: "19:30", room: "102", instructor: "T04" },
      { subject: "HM105", day: "WEDNESDAY", start: "19:30", end: "21:00", room: "102", instructor: "T04" },
      { subject: "GE103", day: "THURSDAY", start: "18:00", end: "19:30", room: "101", instructor: "T05" },
      { subject: "GE107", day: "THURSDAY", start: "19:30", end: "21:00", room: "101", instructor: "T05" },
    ],
  },
  {
    program: "HRS",
    yearLevel: 2,
    name: "HRS 2-A",
    shift: "Afternoon",
    classes: [
      { subject: "PE104", day: "MONDAY", start: "10:00", end: "11:30", room: "102", instructor: "T02" },
      { subject: "GE108", day: "MONDAY", start: "11:30", end: "13:00", room: "102", instructor: "T01" },
      { subject: "HRM105", day: "WEDNESDAY", start: "10:00", end: "12:00", room: "HK-LAB", instructor: "T11" },
      { subject: "FIL102", day: "THURSDAY", start: "18:00", end: "19:30", room: online, instructor: "T09" },
      { subject: "HM105", day: "THURSDAY", start: "10:00", end: "11:30", room: "102", instructor: "T06" },
      { subject: "HRM107", day: "THURSDAY", start: "11:30", end: "13:00", room: "102", instructor: "T06" },
      { subject: "HRM117", day: "SATURDAY", start: "10:00", end: "11:30", room: "102", instructor: "T12" },
    ],
  },
  {
    program: "HRS",
    yearLevel: 2,
    name: "HRS 2-E",
    shift: "Evening",
    classes: [
      { subject: "PE104", day: "MONDAY", start: "18:00", end: "19:30", room: "102", instructor: "T02" },
      { subject: "GE108", day: "MONDAY", start: "19:30", end: "21:00", room: "102", instructor: "T01" },
      { subject: "HRM105", day: "WEDNESDAY", start: "18:00", end: "20:00", room: "HK-LAB", instructor: "T11" },
      // Poster room was 101 (see note 2 at the top).
      { subject: "HM105", day: "THURSDAY", start: "18:00", end: "19:30", room: "102", instructor: "T06" },
      { subject: "HRM107", day: "THURSDAY", start: "19:30", end: "21:00", room: "102", instructor: "T06" },
      { subject: "FIL102", day: "FRIDAY", start: "18:00", end: "19:30", room: online, instructor: "T09" },
      { subject: "HRM117", day: "SATURDAY", start: "11:30", end: "13:00", room: "102", instructor: "T12" },
    ],
  },
];
