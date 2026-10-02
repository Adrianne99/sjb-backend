// Student portal accounts: creation, temporary passwords and activation.
//
// Rules (from the school's requirements):
// - Username = student number.
// - Initial password = birthdate as MMDDYYYY, stored ONLY as an Argon2 hash.
// - The account is flagged mustChangePassword, so the student must replace it
//   at first login before they can use the portal.
// - Staff resets generate a NEW random temporary password; old passwords are
//   never shown (we couldn't — only hashes are stored).
import { prisma, type DbClient } from "../../config/database";
import * as sessionRepository from "../../repositories/session.repository";
import * as studentRepository from "../../repositories/student.repository";
import * as userRepository from "../../repositories/user.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { logger } from "../../utils/logger";
import { fullName } from "../../utils/person";
import { birthdatePassword, generateTemporaryPassword, hashPassword } from "../../utils/password";
import type { CreateAccountInput } from "../../validators/student.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import * as emailService from "../email/email.service";

export interface IssuedCredentials {
  username: string;
  /** Shown ONCE to the staff member, never stored in plain text. */
  temporaryPassword: string;
  emailSent: boolean;
}

async function loadStudent(studentId: number, db: DbClient = prisma) {
  const student = await studentRepository.findStudentById(studentId, db);
  if (!student) throw AppError.notFound("Student not found.");
  return student;
}

/**
 * Creates the portal account. Pass `db` to run inside an existing transaction
 * (used when creating a student and their account together).
 */
export async function createStudentAccount(
  studentId: number,
  input: CreateAccountInput,
  actor: Actor,
  db?: DbClient,
): Promise<IssuedCredentials> {
  const run = async (tx: DbClient) => {
    const student = await loadStudent(studentId, tx);
    if (student.userId) throw AppError.conflict("This student already has a portal account.");
    if (student.status === "ARCHIVED") throw AppError.badRequest("Restore the student record before creating an account.");

    const username = student.studentNumber;
    if (await userRepository.isUsernameTaken(username, tx)) {
      throw AppError.conflict(`The username ${username} is already in use.`);
    }

    const email = input.email ?? student.profile?.email ?? null;
    if (email && (await userRepository.isEmailTaken(email, undefined, tx))) {
      throw AppError.conflict("That email address is already used by another account.", { email: "Already in use." });
    }

    const temporaryPassword = birthdatePassword(student.dateOfBirth);
    const role = await userRepository.findRoleByName("STUDENT", tx);

    const user = await tx.user.create({
      data: {
        username,
        email,
        passwordHash: await hashPassword(temporaryPassword),
        roleId: role.id,
        mustChangePassword: true,
      },
    });
    await studentRepository.updateStudent(student.id, { userId: user.id }, tx);

    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.ACCOUNT_CREATED,
        entityType: "user",
        entityId: user.id,
        description: `Created student portal account ${username} for ${fullName(student)}`,
        metadata: { studentId: student.id },
      },
      tx,
    );

    return { username, temporaryPassword, email, name: fullName(student) };
  };

  const created = db ? await run(db) : await prisma.$transaction(run);

  let emailSent = false;
  if (input.sendEmail && created.email) {
    emailSent = await emailService.sendStudentAccountCreatedEmail({
      to: created.email,
      name: created.name,
      username: created.username,
    });
  }

  return { username: created.username, temporaryPassword: created.temporaryPassword, emailSent };
}

export async function resetStudentPassword(studentId: number, actor: Actor): Promise<IssuedCredentials> {
  const student = await loadStudent(studentId);
  if (!student.userId) throw AppError.badRequest("This student does not have a portal account yet.");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const userId = student.userId;

  const user = await prisma.$transaction(async (tx) => {
    const updated = await userRepository.updateUser(
      userId,
      { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
      tx,
    );
    await sessionRepository.deleteUserSessions(userId, undefined, tx);
    await sessionRepository.invalidateUserResetTokens(userId, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        entityType: "user",
        entityId: userId,
        description: `Issued a new temporary password for ${updated.username}`,
        metadata: { studentId },
      },
      tx,
    );
    return updated;
  });

  return { username: user.username, temporaryPassword, emailSent: false };
}

export async function setStudentAccountActive(studentId: number, isActive: boolean, actor: Actor) {
  const student = await loadStudent(studentId);
  if (!student.userId) throw AppError.badRequest("This student does not have a portal account yet.");
  const userId = student.userId;

  await prisma.$transaction(async (tx) => {
    await userRepository.updateUser(userId, { isActive }, tx);
    if (!isActive) await sessionRepository.deleteUserSessions(userId, undefined, tx);
    await recordAudit(
      actor,
      {
        action: isActive ? AUDIT_ACTIONS.ACCOUNT_ACTIVATED : AUDIT_ACTIONS.ACCOUNT_DEACTIVATED,
        entityType: "user",
        entityId: userId,
        description: `${isActive ? "Activated" : "Deactivated"} the portal account of ${fullName(student)}`,
      },
      tx,
    );
  });
}

/**
 * Online applicants get their portal account when they are officially enrolled
 * (after paying at the school). Called after an enrollment becomes ENROLLED.
 * Does nothing for students who did not apply online or already have an
 * account. Never throws: a problem (e.g. email already used) is only logged,
 * and staff can still create the account by hand.
 */
export async function createAccountIfApplicant(studentId: number, actor: Actor) {
  try {
    const student = await prisma.student.findUnique({ where: { id: studentId }, include: { application: true } });
    if (!student || student.userId || !student.application) return;
    await createStudentAccount(studentId, { email: student.application.email, sendEmail: true }, actor);
  } catch (error) {
    logger.error("Could not create the portal account for an online applicant", { studentId, error: (error as Error).message });
  }
}
