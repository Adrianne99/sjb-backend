// A known, safe-to-show error. Throw these from services; the error middleware
// turns them into the standard JSON error response.
//
//   throw AppError.notFound("Student not found.");

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_DISABLED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "FORBIDDEN"
  | "CSRF_INVALID"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SCHEDULE_CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  // SJB Assistant chat sessions (the frontend starts a new conversation on these)
  | "CHAT_SESSION_REQUIRED" // no chat cookie
  | "CHAT_SESSION_INVALID" // unknown token, or it belongs to another account
  | "CHAT_SESSION_EXPIRED"
  | "CHAT_SESSION_REVOKED"
  | "CHAT_CSRF_INVALID";

export class AppError extends Error {
  readonly statusCode: number;
  readonly errorCode: ErrorCode;
  /** Field-level messages, e.g. { student_number: "Already taken." } */
  readonly errors?: Record<string, string>;
  /** Extra safe data for the client (e.g. which schedules conflict). */
  readonly details?: unknown;

  constructor(
    statusCode: number,
    errorCode: ErrorCode,
    message: string,
    options: { errors?: Record<string, string>; details?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.errors = options.errors;
    this.details = options.details;
  }

  static badRequest(message: string, errors?: Record<string, string>) {
    return new AppError(400, "BAD_REQUEST", message, { errors });
  }

  static validation(errors: Record<string, string>) {
    return new AppError(422, "VALIDATION_FAILED", "Validation failed.", { errors });
  }

  static unauthorized(message = "Please log in to continue.") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "You are not authorized to access this resource.") {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message = "The requested record was not found.") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, errors?: Record<string, string>) {
    return new AppError(409, "CONFLICT", message, { errors });
  }
}
