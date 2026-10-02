import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Student number or username is required.").max(191),
  password: z.string().min(1, "Password is required.").max(128),
  rememberMe: z.boolean().optional().default(false),
});

const newPasswordFields = {
  newPassword: z.string().min(1, "New password is required.").max(128),
  confirmPassword: z.string().min(1, "Please confirm your new password."),
};

function passwordsMatch(data: { newPassword: string; confirmPassword: string }) {
  return data.newPassword === data.confirmPassword;
}

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Current password is required."), ...newPasswordFields })
  .refine(passwordsMatch, { message: "Passwords do not match.", path: ["confirmPassword"] });

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your student number, username or email.").max(191),
});

export const resetPasswordSchema = z
  .object({ token: z.string().min(20, "This reset link is invalid.").max(200), ...newPasswordFields })
  .refine(passwordsMatch, { message: "Passwords do not match.", path: ["confirmPassword"] });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
