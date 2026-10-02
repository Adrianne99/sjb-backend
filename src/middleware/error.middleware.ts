// Turns every error into the standard JSON error format, e.g.
//   { "success": false, "message": "...", "error_code": "FORBIDDEN" }
// Internal details (stack traces, SQL) are logged on the server, never sent.
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client";
import { AppError } from "../utils/app-error";
import { logger } from "../utils/logger";
import { zodErrorToFieldErrors } from "../utils/validate";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.`, error_code: "NOT_FOUND" });
}

function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): AppError | null {
  switch (error.code) {
    case "P2002": // unique constraint
      return AppError.conflict("A record with the same unique value already exists.");
    case "P2025": // record not found
      return AppError.notFound();
    case "P2003": // foreign key
      return AppError.badRequest("A related record does not exist or is still in use.");
    default:
      return null;
  }
}

// Express recognises error handlers by their 4 arguments, so keep `_next`.
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  let appError: AppError | null = null;

  if (error instanceof AppError) appError = error;
  else if (error instanceof ZodError) appError = AppError.validation(zodErrorToFieldErrors(error));
  else if (error instanceof Prisma.PrismaClientKnownRequestError) appError = fromPrismaError(error);
  else if (isBodyParserError(error)) {
    appError =
      error.type === "entity.too.large"
        ? new AppError(413, "BAD_REQUEST", "The request is too large.")
        : AppError.badRequest("The request body is not valid JSON.");
  }

  if (!appError) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, error);
    res.status(500).json({ success: false, message: "Something went wrong. Please try again later.", error_code: "INTERNAL_ERROR" });
    return;
  }

  const body: Record<string, unknown> = { success: false, message: appError.message, error_code: appError.errorCode };
  if (appError.errors) body.errors = appError.errors;
  if (appError.details !== undefined) body.details = appError.details;
  res.status(appError.statusCode).json(body);
}

/** express.json() errors have a `type` like "entity.parse.failed". */
function isBodyParserError(error: unknown): error is { type: string } {
  const type = (error as { type?: unknown } | null)?.type;
  return typeof type === "string" && type.startsWith("entity.");
}
