// =============================================================================
// Online pre-registration ("Enroll Now" on the website).
//
//   1. Applicant submits the public form  -> Application (SUBMITTED) + email
//      with a reference number and what to bring.
//   2. Applicant visits the school. The Registrar opens the application and
//      clicks Convert -> Student record + PENDING enrollment (no retyping).
//      (or Reject, with a reason)
//   3. Applicant pays at the Accounting Office -> staff mark the enrollment
//      ENROLLED -> portal account + "You're enrolled" email
//      (see createAccountIfApplicant in student-account.service.ts).
// =============================================================================
import { prisma } from "../../config/database";
import type { Prisma } from "../../generated/prisma/client";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { fromDateOnlyString, toDateOnlyString } from "../../utils/dates";
import { buildPaginationMeta, toSkipTake } from "../../utils/pagination";
import { fullName } from "../../utils/person";
import { allowedYearLevels, assertYearLevel, yearLevelLabel } from "../../utils/year-levels";
import type { ApplicationInput, ConvertApplicationInput, ListApplicationsQuery } from "../../validators/application.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import { sendEmail } from "../email/resend.service";
import { applicationReceivedEmail } from "../email/templates/application-received";
import { notifyLater } from "../notifications/student-notifications.service";
import { listPublicRequirements } from "../requirements/requirement.service";
import { createStudent } from "../students/student.service";

const applicationInclude = {
  program: true,
  reviewedBy: { include: { staffProfile: true } },
  student: true,
} satisfies Prisma.ApplicationInclude;

type ApplicationRow = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;

const peso = (value: number | string) => `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

function toApplicationDto(application: ApplicationRow) {
  const reviewer = application.reviewedBy;
  return {
    id: application.id,
    referenceNumber: application.referenceNumber,
    status: application.status,
    firstName: application.firstName,
    middleName: application.middleName,
    lastName: application.lastName,
    suffix: application.suffix,
    fullName: fullName(application),
    dateOfBirth: toDateOnlyString(application.dateOfBirth),
    sex: application.sex,
    email: application.email,
    contactNumber: application.contactNumber,
    addressLine: application.addressLine,
    barangay: application.barangay,
    city: application.city,
    province: application.province,
    zipCode: application.zipCode,
    guardianName: application.guardianName,
    guardianRelationship: application.guardianRelationship,
    guardianContactNumber: application.guardianContactNumber,
    program: { id: application.program.id, code: application.program.code, name: application.program.name, level: application.program.level },
    yearLevel: application.yearLevel,
    yearLevelLabel: yearLevelLabel(application.yearLevel),
    applicantType: application.applicantType,
    previousSchool: application.previousSchool,
    remarks: application.remarks,
    reviewedBy: reviewer ? (reviewer.staffProfile ? `${reviewer.staffProfile.firstName} ${reviewer.staffProfile.lastName}` : reviewer.username) : null,
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
    student: application.student ? { id: application.student.id, studentNumber: application.student.studentNumber } : null,
    createdAt: application.createdAt.toISOString(),
  };
}

// --- Public form -------------------------------------------------------------------

/** Programs (with allowed year levels) and documents, for the public form. */
export async function getApplicationFormOptions() {
  const [programs, requirements] = await Promise.all([
    prisma.program.findMany({ where: { isActive: true }, orderBy: [{ level: "desc" }, { name: "asc" }] }),
    listPublicRequirements(),
  ]);
  return {
    programs: programs.map((program) => ({
      id: program.id,
      code: program.code,
      name: program.name,
      level: program.level,
      yearLevels: allowedYearLevels(program).map((level) => ({ value: level, label: yearLevelLabel(level) })),
    })),
    requirements: requirements.map((item) => ({ name: item.name, description: item.description })),
  };
}

/** One line about fees for the applicant's program (from the fee table). */
async function feeNoteFor(programId: number, yearLevel: number) {
  const row = await prisma.feeSchedule.findUnique({ where: { programId_yearLevel: { programId, yearLevel } } });
  if (!row || !row.isActive) return null;
  if (row.annualTuition !== null) {
    return `Senior High School: free tuition with a voucher (bring your voucher certificate if you have one); ${peso(row.annualTuition.toString())} for the whole school year without a voucher.`;
  }
  return `Down payment: ${peso(row.downPayment.toString())}. Your payment option (installment, early bird or cash) is chosen at the Accounting Office.`;
}

export async function submitApplication(input: ApplicationInput, ipAddress: string | null) {
  if (input.website) throw AppError.badRequest("Your application could not be submitted."); // spam bot

  const program = await prisma.program.findUnique({ where: { id: input.programId } });
  if (!program || !program.isActive) throw AppError.validation({ programId: "Select a program." });
  assertYearLevel(program, input.yearLevel);

  // The same person applying twice while the first is still waiting.
  const duplicate = await prisma.application.findFirst({
    where: {
      status: "SUBMITTED",
      OR: [
        { email: input.email },
        { firstName: input.firstName, lastName: input.lastName, dateOfBirth: fromDateOnlyString(input.dateOfBirth) },
      ],
    },
  });
  if (duplicate) {
    throw AppError.conflict("An application with these details is already waiting for review. Please visit the Registrar's Office with your reference number.");
  }

  const { privacyConsent: _consent, website: _website, ...fields } = input;
  const year = new Date().getFullYear();
  const application = await prisma.$transaction(async (tx) => {
    const created = await tx.application.create({
      data: {
        ...fields,
        dateOfBirth: fromDateOnlyString(input.dateOfBirth),
        referenceNumber: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        privacyConsentAt: new Date(),
        ipAddress,
      },
    });
    // Short, easy-to-read reference based on the record number, e.g. APP-2026-00042.
    const referenceNumber = `APP-${year}-${String(created.id).padStart(5, "0")}`;
    const updated = await tx.application.update({ where: { id: created.id }, data: { referenceNumber }, include: applicationInclude });
    await recordAudit(
      { userId: null, role: null, ipAddress },
      {
        action: AUDIT_ACTIONS.APPLICATION_SUBMITTED,
        entityType: "application",
        entityId: created.id,
        description: `Online application ${referenceNumber} from ${fullName(updated)} — ${program.code} ${yearLevelLabel(input.yearLevel)}`,
      },
      tx,
    );
    return updated;
  });

  // Confirmation email with the reference number and what to bring (in the background).
  notifyLater("application received", async () => {
    const [requirements, feeNote] = await Promise.all([listPublicRequirements(), feeNoteFor(program.id, input.yearLevel)]);
    const email = applicationReceivedEmail({
      firstName: application.firstName,
      referenceNumber: application.referenceNumber,
      program: `${program.name} (${program.code})`,
      yearLevel: yearLevelLabel(application.yearLevel),
      requirements: requirements.map((item) => item.name),
      feeNote,
    });
    await sendEmail({ to: application.email, ...email });
  });

  // Only what the applicant needs to see — never other people's data.
  return {
    referenceNumber: application.referenceNumber,
    firstName: application.firstName,
    program: `${program.name} (${program.code})`,
    yearLevel: yearLevelLabel(application.yearLevel),
    email: application.email,
    feeNote: await feeNoteFor(program.id, input.yearLevel),
  };
}

// --- Staff review ----------------------------------------------------------------------

export async function listApplications(query: ListApplicationsQuery) {
  const { page, pageSize, search, status, programId } = query;
  const where: Prisma.ApplicationWhereInput = {
    ...(status ? { status } : {}),
    ...(programId ? { programId } : {}),
    ...(search
      ? { OR: [{ referenceNumber: { contains: search } }, { firstName: { contains: search } }, { lastName: { contains: search } }, { email: { contains: search } }] }
      : {}),
  };
  const [items, total, waiting] = await Promise.all([
    prisma.application.findMany({ where, include: applicationInclude, orderBy: [{ createdAt: "desc" }], ...toSkipTake({ page, pageSize }) }),
    prisma.application.count({ where }),
    prisma.application.count({ where: { status: "SUBMITTED" } }),
  ]);
  return { items: items.map(toApplicationDto), meta: { ...buildPaginationMeta({ page, pageSize }, total), waiting } };
}

async function loadApplication(id: number) {
  const application = await prisma.application.findUnique({ where: { id }, include: applicationInclude });
  if (!application) throw AppError.notFound("Application not found.");
  return application;
}

/** One application, plus existing students with the same name and birthdate (possible duplicates). */
export async function getApplication(id: number) {
  const application = await loadApplication(id);
  const matches = await prisma.student.findMany({
    where: { firstName: application.firstName, lastName: application.lastName, dateOfBirth: application.dateOfBirth },
    select: { id: true, studentNumber: true, firstName: true, lastName: true, status: true },
    take: 5,
  });
  return { ...toApplicationDto(application), possibleMatches: matches };
}

/** Creates the student record + PENDING enrollment from the application (one transaction). */
export async function convertApplication(id: number, input: ConvertApplicationInput, actor: Actor) {
  const application = await loadApplication(id);
  if (application.status !== "SUBMITTED") throw AppError.conflict("This application was already reviewed.");

  const created = await createStudent(
    {
      firstName: application.firstName,
      middleName: application.middleName,
      lastName: application.lastName,
      suffix: application.suffix,
      dateOfBirth: toDateOnlyString(application.dateOfBirth),
      sex: application.sex,
      programId: application.programId,
      profile: {
        email: application.email,
        contactNumber: application.contactNumber,
        addressLine: application.addressLine,
        barangay: application.barangay,
        city: application.city,
        province: application.province,
        zipCode: application.zipCode,
        guardianName: application.guardianName,
        guardianRelationship: application.guardianRelationship,
        guardianContactNumber: application.guardianContactNumber,
      },
      initialEnrollment: { semesterId: input.semesterId, yearLevel: input.yearLevel ?? application.yearLevel, sectionId: input.sectionId ?? null, status: "PENDING" },
      // The portal account is created later, when the enrollment becomes ENROLLED (after payment).
      createAccount: false,
    },
    actor,
    {
      withinTransaction: async (tx, { studentId }) => {
        const claimed = await tx.application.updateMany({
          where: { id, status: "SUBMITTED" },
          data: { status: "CONVERTED", studentId, reviewedById: actor.userId, reviewedAt: new Date() },
        });
        if (claimed.count === 0) throw AppError.conflict("This application was already reviewed.");
        await recordAudit(
          actor,
          {
            action: AUDIT_ACTIONS.APPLICATION_CONVERTED,
            entityType: "application",
            entityId: id,
            description: `Converted application ${application.referenceNumber} to a student record (${fullName(application)})`,
            metadata: { studentId },
          },
          tx,
        );
      },
    },
  );

  return { application: await getApplication(id), student: created.student };
}

export async function rejectApplication(id: number, remarks: string, actor: Actor) {
  const application = await loadApplication(id);
  if (application.status !== "SUBMITTED") throw AppError.conflict("This application was already reviewed.");
  await prisma.$transaction(async (tx) => {
    await tx.application.update({ where: { id }, data: { status: "REJECTED", remarks, reviewedById: actor.userId, reviewedAt: new Date() } });
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.APPLICATION_REJECTED,
        entityType: "application",
        entityId: id,
        description: `Rejected application ${application.referenceNumber} (${fullName(application)}): ${remarks}`,
      },
      tx,
    );
  });
  return getApplication(id);
}

