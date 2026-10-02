// Small helpers that run a Zod schema and throw our standard validation error.
//
//   const input = parseInput(createStudentSchema, req.body);
//   const id = parseId(req.params.id);
import { z } from "zod";
import { AppError } from "./app-error";

/** Converts a field path like ["guardian", "name"] into "guardian.name". */
function toFieldName(path: PropertyKey[]): string {
  return path.length ? path.map(String).join(".") : "form";
}

export function zodErrorToFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = toFieldName(issue.path);
    // Keep the first message per field — it is usually the most useful one.
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw AppError.validation(zodErrorToFieldErrors(result.error));
  }
  return result.data;
}

/** Validates a numeric route parameter such as /students/:id. */
export function parseId(value: unknown, field = "id"): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.validation({ [field]: "Must be a valid ID." });
  }
  return id;
}
