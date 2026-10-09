// My Account — office staff and teachers manage their OWN profile and email
// settings. (Students have their own pages under /api/me.)
// Position, role and the linked instructor are changed by an administrator only.
import { prisma } from "../../config/database";
import * as userRepository from "../../repositories/user.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import type { AccountNotificationsInput, AccountProfileInput } from "../../validators/account.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";

type AccountUser = NonNullable<Awaited<ReturnType<typeof userRepository.findUserById>>>;

function toAccountDto(user: AccountUser) {
  return {
    username: user.username,
    role: user.role.name,
    email: user.email,
    firstName: user.staffProfile?.firstName ?? null,
    lastName: user.staffProfile?.lastName ?? null,
    position: user.staffProfile?.position ?? null,
    contactNumber: user.staffProfile?.contactNumber ?? null,
    /** TEACHER accounts: the linked instructor. */
    instructor: user.instructor
      ? { id: user.instructor.id, employeeNumber: user.instructor.employeeNumber, fullName: `${user.instructor.firstName} ${user.instructor.lastName}` }
      : null,
    notifications: {
      notifyAccountActivity: user.notifyAccountActivity,
      // Stored in notify_school_records (for students: enrollment, payment and grade emails).
      notifyWorkUpdates: user.notifySchoolRecords,
    },
  };
}

async function findAccount(userId: number) {
  const user = await userRepository.findUserById(userId);
  if (!user) throw AppError.notFound("Account not found.");
  return user;
}

export async function getMyAccount(userId: number) {
  return toAccountDto(await findAccount(userId));
}

export async function updateMyProfile(userId: number, input: AccountProfileInput, actor: Actor) {
  const user = await findAccount(userId);
  if (await userRepository.isEmailTaken(input.email, userId)) {
    throw AppError.conflict("That email address is already used.", { email: "Already in use." });
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { email: input.email } });
    await tx.staffProfile.upsert({
      where: { userId },
      create: { userId, firstName: input.firstName, lastName: input.lastName, contactNumber: input.contactNumber },
      update: { firstName: input.firstName, lastName: input.lastName, contactNumber: input.contactNumber },
    });
    await recordAudit(
      actor,
      { action: AUDIT_ACTIONS.PROFILE_UPDATED, entityType: "user", entityId: userId, description: `${user.username} updated their account details` },
      tx,
    );
  });

  return getMyAccount(userId);
}

export async function updateMyNotifications(userId: number, input: AccountNotificationsInput) {
  await findAccount(userId);
  await prisma.user.update({
    where: { id: userId },
    data: {
      notifyAccountActivity: input.notifyAccountActivity,
      ...(input.notifyWorkUpdates !== undefined ? { notifySchoolRecords: input.notifyWorkUpdates } : {}),
    },
  });
  return getMyAccount(userId);
}
