// Authorization middleware. Always place AFTER requireAuth.
//
//   router.get("/", requireAuth, requirePermission("students:read"), controller.list);
//
// The permission matrix lives in src/config/permissions.ts.
import type { NextFunction, Request, Response } from "express";
import type { RoleName } from "../generated/prisma/client";
import { roleHasPermission, type Permission } from "../config/permissions";
import { AppError } from "../utils/app-error";

/** Allows the request if the user has ANY of the listed permissions. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.auth?.user.role;
    if (!role) return next(AppError.unauthorized());
    const allowed = permissions.some((permission) => roleHasPermission(role, permission));
    if (!allowed) return next(AppError.forbidden());
    next();
  };
}

/** Allows the request if the user has one of the listed roles. */
export function requireRole(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.auth?.user.role;
    if (!role) return next(AppError.unauthorized());
    if (!roles.includes(role)) return next(AppError.forbidden());
    next();
  };
}
