// =============================================================================
// SCHOOL INFORMATION FOR THE AI CHATBOT — ✏️ EDIT THIS FILE
//
// The AI assistant may ONLY answer from what is written here, plus the public
// data the school manages in the app (programs, admission requirements,
// tuition fees and public announcements — see school-context.ts).
//
// Each fact has `confirmed`:
//   confirmed: false → SAMPLE data. The assistant will say it is not yet
//                      confirmed and ask the person to check with the school.
//   confirmed: true  → official information approved by the school.
//
// When you replace a sample with the real information, change it to `true`.
// Keep everything PUBLIC: never put student, staff or financial records here.
// =============================================================================

export interface SchoolFact {
  topic: string;
  details: string;
  confirmed: boolean;
}

export const SCHOOL_PROFILE = {
  name: "Saint John Bosco Institute of Arts and Sciences",
  shortName: "SJB",
  location: "Kalentong, Mandaluyong City, Philippines",
  website: "This website (About, Academics, Admissions and Contact sections on the home page, and the Announcements page)",
};

export const SCHOOL_FACTS: SchoolFact[] = [
  // --- About the school ---------------------------------------------------------
  {
    topic: "About the school",
    details:
      "Saint John Bosco Institute of Arts and Sciences is a school in Kalentong, Mandaluyong City. It offers Senior High School (Grade 11 and Grade 12) and two college programs: Information Technology (IT) and Hotel and Restaurant Services (HRS), 1st and 2nd year.",
    confirmed: true,
  },
  {
    topic: "Mission and vision",
    details: "SAMPLE: The school aims to provide quality, values-based education that prepares students for work and further studies.",
    confirmed: false,
  },

  // --- Contact & office hours ---------------------------------------------------
  {
    topic: "Contact information",
    details:
      "SAMPLE: Phone (02) 0000-0000, mobile 0900 000 0000, email info@example.com. Official numbers are listed in the Contact section of this website.",
    confirmed: false,
  },
  {
    topic: "Office hours",
    details: "SAMPLE: Registrar's and Accounting offices are open Monday to Friday, 8:00 AM to 5:00 PM, and Saturday, 8:00 AM to 12:00 NN. Closed on Sundays and holidays.",
    confirmed: false,
  },
  {
    topic: "How to get there",
    details: "SAMPLE: The campus is in Kalentong, Mandaluyong City, reachable by jeepney routes passing Kalentong and New Panaderos streets.",
    confirmed: false,
  },

  // --- Admissions & enrollment --------------------------------------------------
  {
    topic: "Enrollment period",
    details:
      "SAMPLE: Enrollment for the First Semester usually runs from May until the first week of July (classes start July 7, 2026); for the Second Semester, in November. Exact dates are posted in Announcements.",
    confirmed: false,
  },
  {
    topic: "Start of classes",
    details:
      "Classes for the First Semester of School Year 2026-2027 start on July 7, 2026. Students should check their assigned year level, section and class schedule, arrive 15 minutes early, wear proper attire and follow school rules.",
    confirmed: true,
  },
  {
    topic: "Class shifts and online classes",
    details:
      "College sections have morning (M), afternoon (A) and evening (E) shifts, for example IT 1-A (afternoon) and IT 1-E (evening); HRS 1st year also has a morning section (HRS 1-M). Some subjects are online. Some classes are combined, meaning two sections meet together. Students see their exact schedule in the Student Portal under My Schedule.",
    confirmed: true,
  },
  {
    topic: "How to enroll",
    details:
      "1) Apply online with the pre-registration form (the Enroll Now button on this website) and get a reference number by email. 2) Visit the Registrar's Office with the reference number and the original documents. 3) Pay the down payment or full payment at the Accounting Office (no online payment; the payment option is chosen there). 4) Once officially enrolled, the class schedule and Student Portal login are sent by email.",
    confirmed: true,
  },
  {
    topic: "Transferees",
    details: "SAMPLE: Transferees should bring their Transcript of Records or Form 137, Honorable Dismissal / Certificate of Transfer, and Good Moral Certificate. Subjects may be credited after evaluation by the Registrar.",
    confirmed: false,
  },
  {
    topic: "Irregular students and cross enrollment",
    details:
      "Irregular students can take extra subjects with another section, as long as the class schedule does not clash. A cross-enrollment fee applies per 3-unit subject, cash basis only (see the tuition fees).",
    confirmed: true,
  },

  // --- Payments ------------------------------------------------------------------
  {
    topic: "Payment channels",
    details:
      "SAMPLE: Payments are accepted at the Accounting Office (cash). Bank transfer, GCash or Maya may be accepted — ask the Accounting Office for the official account details. Online payment through the Student Portal is not available.",
    confirmed: false,
  },
  {
    topic: "Senior High voucher",
    details:
      "Senior High School students with a voucher have free tuition. Without a voucher, the whole-year tuition applies. SAMPLE: Ask the Registrar's Office about voucher eligibility and the documents needed.",
    confirmed: false,
  },
  {
    topic: "Scholarships and discounts",
    details: "SAMPLE: Early-bird and cash payment discounts are available (see tuition fees). Ask the Accounting Office about other scholarships or sibling discounts.",
    confirmed: false,
  },

  // --- Student life & services -------------------------------------------------
  {
    topic: "Student Portal",
    details:
      "Enrolled students log in to the Student Portal with their student number. New accounts use a temporary password (birthdate in MMDDYYYY format) that must be changed at first login. In the portal, students see their grades, report card, class schedule, balance and payments. Forgot your password? Use 'Forgot password' on the login page or ask the Registrar.",
    confirmed: true,
  },
  {
    topic: "School documents",
    details:
      "SAMPLE: Requests for Form 137, Form 138 (report card), Certificate of Enrollment, Good Moral Certificate and Transcript of Records are filed at the Registrar's Office. Processing usually takes 3 to 5 working days.",
    confirmed: false,
  },
  {
    topic: "Uniform and ID",
    details: "SAMPLE: Students wear the prescribed school uniform and ID inside the campus. HRS students have a separate uniform for kitchen and laboratory classes.",
    confirmed: false,
  },
  {
    topic: "Facilities",
    details: "SAMPLE: Computer laboratories for IT, a kitchen laboratory for HRS, classrooms and a library.",
    confirmed: false,
  },
  {
    topic: "Grading",
    details:
      "College uses a 1.00 to 5.00 scale (1.00 is highest, 3.00 is passing). Senior High School uses 60 to 100 (75 is passing). INC means incomplete — the student should complete the requirements with the instructor.",
    confirmed: true,
  },
];
