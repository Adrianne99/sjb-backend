// =============================================================================
// CHATBOT KNOWLEDGE BASE — school-approved answers only.
//
// ✏️  EDIT THIS FILE to replace the placeholder answers with OFFICIAL
//     information from the Registrar's and Accounting offices.
//
// Each entry has keywords (lower-case) that trigger it. The answer with the
// most keyword matches wins. Keep answers short, factual and public — never
// put personal or student-specific information here.
//
// Answer DIRECTLY: give the actual hours, number, address or steps. Never send
// people to "the Contact section" or another page for something we can say here.
// =============================================================================
import { SCHOOL_CONTACT } from "./school-info";

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
    answer: "Bring these documents to the Registrar's Office:",
  },
  {
    id: "payment-procedures",
    topic: "Payment procedures",
    keywords: ["pay", "payment", "payments", "cashier", "gcash", "maya", "bank", "downpayment"],
    answer:
      `Pay at the school's Accounting Office (${SCHOOL_CONTACT.officeHours}). Online payment is not available. ` +
      "You can pay in installments (down payment, prelim, midterm and final) or pay in full for a discount: early bird (1 month before the term) or cash (up to the first day of classes). " +
      "Enrolled students can see their balance in the Student Portal under Balance & Payments.",
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
      "Classes for the First Semester of School Year 2026-2027 start on July 7, 2026. " +
      "Enrolled students see their own class schedule (subject, instructor, room, day and time) in the Student Portal under My Schedule.",
  },
  {
    id: "announcements",
    topic: "School announcements",
    keywords: ["announcement", "announcements", "news", "event", "events", "update", "updates", "holiday", "suspension"],
    // The latest announcement titles and dates are added from the database.
    answer: "Here are the latest school announcements:",
  },
  {
    id: "office-hours",
    topic: "Office hours",
    keywords: ["office hours", "hours", "open", "opening", "close", "closing", "what time"],
    answer: `The Registrar's and Accounting offices are open ${SCHOOL_CONTACT.officeHours}.`,
  },
  {
    id: "contact",
    topic: "Contact information",
    keywords: ["contact", "phone", "telephone", "call", "number", "email", "e-mail", "reach", "registrar"],
    answer: `Phone: ${SCHOOL_CONTACT.phone}. Email: ${SCHOOL_CONTACT.email}. Office hours: ${SCHOOL_CONTACT.officeHours}.`,
  },
  {
    id: "location",
    topic: "Location",
    keywords: ["address", "location", "located", "where", "directions", "how to get", "map", "visit"],
    answer: `The school is at ${SCHOOL_CONTACT.address}.`,
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
      "The school offers Senior High School (Grade 11 and Grade 12) and two college programs: Information Technology (IT) and Hotel and Restaurant Services (HRS), both 1st and 2nd year.",
  },
];

export const SUGGESTED_QUESTIONS = [
  "What are the admission requirements?",
  "How much is the tuition?",
  "How do I pay my tuition?",
  "Where can I see my class schedule?",
  "How do I log in to the Student Portal?",
];
