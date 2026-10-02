// Stops the public chatbot from being used to look up personal records.
//
// The chatbot never has access to student data in the first place; this guard
// makes that explicit and gives a helpful answer instead of a confusing one.
// Examples that are blocked: "What is John's balance?", "Show me 2026-0001 grades".

const STUDENT_NUMBER_PATTERN = /\b\d{4}-\d{3,6}\b/;

const PRIVATE_TOPICS = /\b(balance|balances|grade|grades|gwa|gpa|average|report card|transcript|payment history|records?|password|account details|birthday|birthdate|address|contact number)\b/i;

const LOOKUP_INTENT = /\b(what('?s| is| are)|show|check|tell me|give me|look ?up|view|see|find|list|how much)\b/i;

/** True when the message asks for someone's private information. */
export function isPrivateRecordRequest(message: string): boolean {
  if (STUDENT_NUMBER_PATTERN.test(message)) return true;
  return PRIVATE_TOPICS.test(message) && LOOKUP_INTENT.test(message);
}

export const PRIVACY_REPLY =
  "I can't look up personal records such as grades, balances or account details — and I never share another person's information. " +
  "Students can see their own records securely by logging in to the Student Portal. " +
  "For other concerns, please contact the Registrar's or Accounting Office directly.";
