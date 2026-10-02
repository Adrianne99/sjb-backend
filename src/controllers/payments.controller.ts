import type { Request, Response } from "express";
import * as paymentService from "../services/payments/payment.service";
import { getActor } from "../utils/request";
import { sendCreated, sendSuccess } from "../utils/response";
import { parseId, parseInput } from "../utils/validate";
import {
  listPaymentsQuerySchema,
  recordPaymentSchema,
  updatePaymentSchema,
  voidPaymentSchema,
} from "../validators/payment.validators";

export async function list(req: Request, res: Response) {
  const result = await paymentService.listPayments(parseInput(listPaymentsQuerySchema, req.query));
  res.json({ success: true, data: result.items, meta: result.meta, summary: result.summary });
}

export async function getById(req: Request, res: Response) {
  sendSuccess(res, await paymentService.getPayment(parseId(req.params.id)));
}

export async function record(req: Request, res: Response) {
  sendCreated(res, await paymentService.recordPayment(parseInput(recordPaymentSchema, req.body), getActor(req)), "Payment recorded.");
}

export async function update(req: Request, res: Response) {
  const input = parseInput(updatePaymentSchema, req.body);
  sendSuccess(res, await paymentService.updatePayment(parseId(req.params.id), input, getActor(req)), { message: "Payment details corrected." });
}

export async function voidPayment(req: Request, res: Response) {
  const { reason } = parseInput(voidPaymentSchema, req.body);
  sendSuccess(res, await paymentService.voidPayment(parseId(req.params.id), reason, getActor(req)), { message: "Payment voided." });
}
