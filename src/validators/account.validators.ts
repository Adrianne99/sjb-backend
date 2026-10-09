// My Account (office staff and teachers): own profile and email settings.
import { z } from "zod";
import { phoneNumber, requiredText } from "./common.validators";

export const accountProfileSchema = z.object({
  firstName: requiredText("First name", 100),
  lastName: requiredText("Last name", 100),
  email: z.email("Enter a valid email address.").max(191).transform((value) => value.toLowerCase()),
  contactNumber: phoneNumber,
});

export const accountNotificationsSchema = z.object({
  /** Password changes and similar security emails. */
  notifyAccountActivity: z.boolean(),
  /** Teachers: emails when their submitted grades are returned or published. */
  notifyWorkUpdates: z.boolean().optional(),
});

export type AccountProfileInput = z.infer<typeof accountProfileSchema>;
export type AccountNotificationsInput = z.infer<typeof accountNotificationsSchema>;
