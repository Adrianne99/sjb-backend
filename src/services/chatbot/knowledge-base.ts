// =============================================================================
// CHATBOT KNOWLEDGE BASE — school-approved answers only.
//
// ✏️  EDIT THIS FILE to replace the placeholder answers with OFFICIAL
//     information from the Registrar's and Accounting offices.
//
// Each entry has keywords (lower-case) that trigger it. The answer with the
// most keyword matches wins. Keep answers short, factual and public — never
// put personal or student-specific information here.
// =============================================================================

export interface KnowledgeEntry {
  id: string;
  topic: string;
  keywords: string[];
  answer: string;
}

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    id: "admission-requirements",
    topic: "Admission requirements",
    keywords: ["admission", "admissions", "requirement", "requirements", "apply", "application", "enroll", "enrollment", "new student", "transferee", "documents"],
    // The actual document list is added from the database (Settings -> Requirements).
    answer: "Please submit these documents to the Registrar's Office:",
  },
  {
    id: "payment-procedures",
    topic: "Payment procedures",
    keywords: ["pay", "payment", "payments", "cashier", "gcash", "maya", "bank", "downpayment"],
    answer:
      "Tuition and fee payments are handled by the school's Accounting Office / Cashier. " +
      "[Placeholder — official payment channels and schedules will be posted here.] " +
      "Enrolled students can view their assessed fees, payments and remaining balance in the Student Portal under Balance & Payments.",
  },
  {
    id: "tuition-fees",
    topic: "Tuition fees",
    keywords: ["tuition", "fee", "fees", "how much", "cost", "price", "installment", "voucher", "early bird", "discount", "cross enrollment", "cross-enrollment"],
    // The amounts are added from the database (Settings -> Tuition & fees).
    answer: "Here are the current tuition fee options:",
  },
  {
    id: "class-schedules",
    topic: "Class schedules",
    keywords: ["schedule", "schedules", "class", "classes", "timetable", "room", "time", "start of classes"],
    answer:
      "Enrolled students can see their own class schedule (subject, instructor, room, day and time) by logging in to the Student Portal and opening My Schedule. " +
      "[Placeholder — the official academic calendar will be linked here.]",
  },
  {
    id: "announcements",
    topic: "School announcements",
    keywords: ["announcement", "announcements", "news", "event", "events", "update", "updates", "holiday", "suspension"],
    answer: "You can read the latest school announcements in the Announcements section of this website.",
  },
  {
    id: "contact",
    topic: "Contact information",
    keywords: ["contact", "phone", "email", "address", "location", "where", "office hours", "hours", "visit", "registrar"],
    answer:
      "Saint John Bosco Institute of Arts and Sciences is in Kalentong, Mandaluyong City. " +
      "Please see the Contact section of this website for the school's official phone numbers, email and office hours.",
  },
  {
    id: "portal-login",
    topic: "Student Portal login",
    keywords: ["login", "log in", "portal", "account", "username", "student number", "first login", "temporary password", "cannot log in", "locked"],
    answer:
      "Log in to the Student Portal with your student number. On your first login you will be asked to replace your temporary password. " +
      "If your account is locked or you cannot log in, wait 15 minutes or contact the Registrar's Office.",
  },
  {
    id: "forgot-password",
    topic: "Forgot password",
    keywords: ["forgot", "reset", "password", "change password"],
    answer:
      "Use \"Forgot password\" on the login page. If your account has an email address on file, a reset link will be sent. " +
      "Otherwise, the Registrar's Office can issue you a new temporary password.",
  },
  {
    id: "programs",
    topic: "Programs offered",
    keywords: ["program", "programs", "course", "courses", "strand", "degree", "offer", "offered", "academics", "senior high", "shs", "grade 11", "grade 12", "college"],
    answer:
      "The school offers Senior High School (Grade 11 and Grade 12) and two college programs: Information Technology (IT) and Hotel and Restaurant Services (HRS), both 1st and 2nd year. " +
      "See the Academics section of this website for details.",
  },
];

export const SUGGESTED_QUESTIONS = [
  "What are the admission requirements?",
  "How much is the tuition?",
  "How do I pay my tuition?",
  "Where can I see my class schedule?",
  "How do I log in to the Student Portal?",
];
