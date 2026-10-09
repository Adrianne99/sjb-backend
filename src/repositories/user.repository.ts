// Database access for user accounts.
import { prisma, type DbClient } from "../config/database";
import type { Prisma, RoleName } from "../generated/prisma/client";

/** Everything we need to know about a user to build their AuthUser. */
export const userWithIdentityInclude = {
  role: true,
  staffProfile: true,
  student: true,
  /** The instructor linked to a TEACHER account (null for everyone else). */
  instructor: true,
} satisfies Prisma.UserInclude;

export type UserWithIdentity = Prisma.UserGetPayload<{ include: typeof userWithIdentityInclude }>;

export function findUserById(id: number, db: DbClient = prisma) {
  return db.user.findUnique({ where: { id }, include: userWithIdentityInclude });
}

/** Login accepts a username, a student number (same as username) or an email. */
export function findUserByLoginIdentifier(identifier: string, db: DbClient = prisma) {
  return db.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
    include: userWithIdentityInclude,
  });
}

export function findRoleByName(name: RoleName, db: DbClient = prisma) {
  return db.role.findUniqueOrThrow({ where: { name } });
}

export function updateUser(id: number, data: Prisma.UserUncheckedUpdateInput, db: DbClient = prisma) {
  return db.user.update({ where: { id }, data, include: userWithIdentityInclude });
}

export function isUsernameTaken(username: string, db: DbClient = prisma) {
  return db.user.count({ where: { username } }).then((count) => count > 0);
}

export function isEmailTaken(email: string, excludeUserId?: number, db: DbClient = prisma) {
  return db.user
    .count({ where: { email, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) } })
    .then((count) => count > 0);
}

export interface ListUsersFilters {
  search?: string;
  role?: RoleName;
  isActive?: boolean;
  skip: number;
  take: number;
}

export async function listUsers(filters: ListUsersFilters) {
  const where: Prisma.UserWhereInput = {
    ...(filters.role ? { role: { name: filters.role } } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.search
      ? {
          OR: [
            { username: { contains: filters.search } },
            { email: { contains: filters.search } },
            { staffProfile: { firstName: { contains: filters.search } } },
            { staffProfile: { lastName: { contains: filters.search } } },
            { student: { firstName: { contains: filters.search } } },
            { student: { lastName: { contains: filters.search } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userWithIdentityInclude,
      orderBy: [{ role: { name: "asc" } }, { username: "asc" }],
      skip: filters.skip,
      take: filters.take,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}
