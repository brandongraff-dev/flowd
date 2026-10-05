import { z } from "zod";

/**
 * Validation for the auth forms. One schema per form; messages say what to do, not what went wrong ("Enter an email like name@example.com").
 * The same rules run again inside the store actions (`signUpCreator`, `signUpBrand`), so a message here never disagrees with a refusal there.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE = /^[a-z0-9._]{2,30}$/;

const email = (empty = "Enter your email address.") => z.string().trim().min(1, empty).regex(EMAIL, "Enter an email like name@example.com.");

/** Handles that read as the company or its staff (kept in step with `core/signup.ts`). */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set(["flowd", "admin", "support", "help", "hello", "team", "ops", "security", "trust", "billing", "press", "legal"]);

export const loginSchema = z.object({
  email: email(),
  password: z.string().min(1, "Enter your password."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email: email() });
export type ForgotValues = z.infer<typeof forgotSchema>;

/** `taken` is the set of handles already in the demo world, so the form can say "taken" before the action does. */
export function creatorSignupSchema(taken: ReadonlySet<string>) {
  return z.object({
    name: z.string().trim().min(2, "Enter your name (at least 2 characters).").max(60, "Keep your name under 60 characters."),
    email: email(),
    handle: z
      .string()
      .min(1, "Pick a handle. It becomes your public link.")
      .regex(HANDLE, "Use 2 to 30 letters, numbers, dots or underscores.")
      .refine((value) => !RESERVED_HANDLES.has(value), "That handle is reserved. Pick one that is yours.")
      .refine((value) => !taken.has(value), "That handle is taken. Try adding a word or a number."),
    confirm18: z.boolean().refine((value) => value, "Confirm you are 18 or older to join."),
    agreement: z.boolean().refine((value) => value, "Accept the creator agreement to continue."),
  });
}
export type CreatorSignupValues = z.infer<ReturnType<typeof creatorSignupSchema>>;

export const UA_BANDS = ["under_5k", "5k_25k", "25k_100k", "over_100k"] as const;
export type UaBandValue = (typeof UA_BANDS)[number];

export const brandSignupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name (at least 2 characters).").max(60, "Keep your name under 60 characters."),
  email: email("Enter your work email."),
  company: z.string().trim().min(2, "Enter your company or app name.").max(60, "Keep it under 60 characters."),
  role: z.string().min(1, "Pick the role closest to yours."),
  uaBand: z.enum(UA_BANDS, "Pick a monthly range. It only decides which plan advice we show."),
});
export type BrandSignupValues = z.infer<typeof brandSignupSchema>;
