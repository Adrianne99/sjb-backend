// User management (ADMIN only): staff/admin accounts, roles, activation, resets.
//
// Safety rules:
// - Admins cannot change their own role or deactivate themselves (no lock-outs).
// - Student accounts keep the STUDENT role; they are managed from the student record.
// - New staff accounts get a random temporary password that must be changed.
// - A TEACHER account is linked to exactly one instructor (instructors.user_id).
import { prisma, type DbClient } from "../../config/database";
import { toUserAccountDto } from "../../mappers/user.mapper";
import * as sessionRepository from "../../repositories/session.repository";
import * as userRepository from "../../repositories/user.repository";
import type { Actor } from "../../types/auth.types";
import { AppError } from "../../utils/app-error";
import { buildPaginationMeta, toSkipTake } from "../../utils/pagination";
import { generateTemporaryPassword, hashPassword } from "../../utils/password";
import type { CreateStaffUserInput, ListUsersQuery, UpdateUserInput } from "../../validators/user.validators";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";

export async function listUsers(query: ListUsersQuery) {
  const { page, pageSize, ...filters } = query;
  const { items, total } = await userRepository.listUsers({ ...filters, ...toSkipTake({ page, pageSize }) });
  return { items: items.map(toUserAccountDto), meta: buildPaginationMeta({ page, pageSize }, total) };
}

export async function getUser(id: number) {
  const user = await userRepository.findUserById(id);
  if (!user) throw AppError.notFound("User not found.");
  return toUserAccountDto(user);
}

/**
 * Links an instructor to a TEACHER account. The instructor must exist and must
 * not already belong to another account.
 */
async function linkInstructor(instructorId: number, userId: number, tx: DbClient) {
  const instructor = await tx.instructor.findUnique({ where: { id: instructorId } });
  if (!instructor) throw AppError.validation({ instructorId: "Instructor not found." });
  if (instructor.userId && instructor.userId !== userId) {
    throw AppError.conflict("This instructor already has a teacher account.", { instructorId: "Already has a teacher account." });
  }
  await tx.instructor.update({ where: { id: instructorId }, data: { userId } });
}

export async function createStaffUser(input: CreateStaffUserInput, actor: Actor) {
  if (await userRepository.isUsernameTaken(input.username)) {
    throw AppError.conflict("That username is already taken.", { username: "Already taken." });
  }
  if (await userRepository.isEmailTaken(input.email)) {
    throw AppError.conflict("That email address is already used.", { email: "Already in use." });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    const role = await userRepository.findRoleByName(input.role, tx);
    const created = await tx.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash,
        roleId: role.id,
        mustChangePassword: true,
        staffProfile: { create: { firstName: input.firstName, lastName: input.lastName, position: input.position } },
      },
      include: userRepository.userWithIdentityInclude,
    });
    if (input.role === "TEACHER") await linkInstructor(input.instructorId!, created.id, tx);
    await recordAudit(
      actor,
      {
        action: AUDIT_ACTIONS.ACCOUNT_CREATED,
        entityType: "user",
        entityId: created.id,
        description: `Created ${input.role} account ${input.username} for ${input.firstName} ${input.lastName}`,
      },
      tx,
    );
    // Reload so the response includes the linked instructor.
    return tx.user.findUniqueOrThrow({ where: { id: created.id }, include: userRepository.userWithIdentityInclude });
  });

  return { user: toUserAccountDto(user), credentials: { username: user.username, temporaryPassword } };
}

export async function updateUser(id: number, input: UpdateUserInput, actor: Actor) {
  const user = await userRepository.findUserById(id);
  if (!user) throw AppError.notFound("User not found.");

  const isSelf = id === actor.userId;
  const roleChanging = input.role !== undefined && input.role !== user.role.name;
  const activeChanging = input.isActive !== undefined && input.isActive !== user.isActive;

  if (roleChanging && isSelf) throw AppError.badRequest("You cannot change your own role.");
  if (activeChanging && isSelf && input.isActive === false) throw AppError.badRequest("You cannot deactivate your own account.");
  if (roleChanging && user.role.name === "STUDENT") {
    throw AppError.badRequest("Student accounts cannot be given staff roles. Create a separate staff account instead.");
  }
  if (input.email && (await userRepository.isEmailTaken(input.email, id))) {
    throw AppError.conflict("That email address is already used.", { email: "Already in use." });
  }
  if (roleChanging && input.role === "TEACHER" && !input.instructorId) {
    throw AppError.validation({ instructorId: "Select the instructor this teacher account belongs to." });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const newRole = roleChanging ? await userRepository.findRoleByName(input.role!, tx) : null;
    // Leaving the TEACHER role unlinks the instructor; becoming a TEACHER links one.
    if (roleChanging && user.role.name === "TEACHER") {
      await tx.instructor.updateMany({ where: { userId: id }, data: { userId: null } });
    }
    if (roleChanging && input.role === "TEACHER") await linkInstructor(input.instructorId!, id, tx);
    const saved = await userRepository.updateUser(
      id,
      {
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(newRole ? { roleId: newRole.id } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      tx,
    );

    if (user.staffProfile && (input.firstName || input.lastName || input.position !== undefined)) {
      await tx.staffProfile.update({
        where: { userId: id },
        data: {
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName ? { lastName: input.lastName } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        },
      });
    }

    // Role or access changes take effect immediately: sign the user out everywhere.
    if (roleChanging || (activeChanging && input.isActive === false)) {
      await sessionRepository.deleteUserSessions(id, undefined, tx);
    }

    if (roleChanging) {
      await recordAudit(
        actor,
        {
          action: AUDIT_ACTIONS.ROLE_CHANGED,
          entityType: "user",
          entityId: id,
          description: `Changed role of ${user.username} from ${user.role.name} to ${input.role}`,
        },
        tx,
      );
    }
    if (activeChanging) {
      await recordAudit(
        actor,
        {
          action: input.isActive ? AUDIT_ACTIONS.ACCOUNT_ACTIVATED : AUDIT_ACTIONS.ACCOUNT_DEACTIVATED,
          entityType: "user",
          entityId: id,
          description: `${input.isActive ? "Activated" : "Deactivated"} account ${user.username}`,
        },
        tx,
      );
    }
    if (!roleChanging && !activeChanging) {
      await recordAudit(
        actor,
        { action: AUDIT_ACTIONS.ACCOUNT_UPDATED, entityType: "user", entityId: id, description: `Updated account details of ${user.username}` },
        tx,
      );
    }
    return saved;
  });

  return getUser(updated.id);
}

export async function resetUserPassword(id: number, actor: Actor) {
  const user = await userRepository.findUserById(id);
  if (!user) throw AppError.notFound("User not found.");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.$transaction(async (tx) => {
    await userRepository.updateUser(id, { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null }, tx);
    await sessionRepository.deleteUserSessions(id, undefined, tx);
    await sessionRepository.invalidateUserResetTokens(id, tx);
    await recordAudit(
      actor,
      { action: AUDIT_ACTIONS.PASSWORD_RESET, entityType: "user", entityId: id, description: `Issued a new temporary password for ${user.username}` },
      tx,
    );
  });

  return { username: user.username, temporaryPassword };
}
