// Every successful API response has the same shape:
//   { "success": true, "data": ..., "meta": { ...pagination } }
import type { Response } from "express";
import type { PaginationMeta } from "./pagination";

export function sendSuccess(
  res: Response,
  data: unknown,
  options: { status?: number; meta?: PaginationMeta; message?: string } = {},
) {
  const body: Record<string, unknown> = { success: true, data };
  if (options.message) body.message = options.message;
  if (options.meta) body.meta = options.meta;
  return res.status(options.status ?? 200).json(body);
}

export function sendCreated(res: Response, data: unknown, message?: string) {
  return sendSuccess(res, data, { status: 201, message });
}
