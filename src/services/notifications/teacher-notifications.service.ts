// Emails to TEACHERS about grades they submitted for review (returned / published).
// Sent in the background (notifyLater); a failed email never breaks the request.
// The teacher can turn these off in My Account (stored in notify_school_records).
import type { SubmissionRow } from "../../repositories/grade-submission.repository";
import { sendEmail } from "../email/resend.service";
import { gradeReviewEmail } from "../email/templates/grade-review";

export async function notifyTeacherOfReview(submission: SubmissionRow) {
  const teacher = submission.instructor?.user;
  if (!teacher?.email || !teacher.isActive || !teacher.notifySchoolRecords) return;
  if (submission.status !== "RETURNED" && submission.status !== "PUBLISHED") return;

  const email = gradeReviewEmail({
    firstName: submission.instructor!.firstName,
    classLabel: `${submission.subject.code} ${submission.subject.name} — ${submission.section.name}`,
    termLabel: `${submission.semester.name}, ${submission.semester.academicYear.name}`,
    outcome: submission.status,
    note: submission.note,
  });
  await sendEmail({ to: teacher.email, ...email });
}
