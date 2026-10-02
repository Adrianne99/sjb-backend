import { z } from "zod";
import { paginationQuerySchema } from "../utils/pagination";
import { dateOnly, optionalId } from "./common.validators";

export const termQuerySchema = z.object({ semesterId: optionalId });

export const collectionsQuerySchema = z
  .object({
    dateFrom: dateOnly("From date"),
    dateTo: dateOnly("To date"),
  })
  .refine((data) => data.dateTo >= data.dateFrom, { message: "End date must be on or after the start date.", path: ["dateTo"] });

export const outstandingQuerySchema = paginationQuerySchema.extend({ semesterId: optionalId });
