"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { createProfile, HANDLE_PATTERN, isHandleAvailable } from "@/domain/people/profiles";
import { auth } from "@/lib/auth";
import { clientAddress, enforceLimit } from "@/lib/rate-limit";

export type FormState = { error?: string };

const signupSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  handle: z.string().regex(HANDLE_PATTERN, "Handles are 3 to 30 characters: lowercase letters, numbers and underscores"),
  displayName: z.string().trim().min(1, "Enter a display name").max(80),
});

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const { email, password, handle, displayName } = parsed.data;
  const db = getDb();
  if (!(await isHandleAvailable(db, handle))) return { error: "That handle is already taken" };
  try {
    await enforceLimit("signup", await clientAddress());
  } catch (err) {
    return { error: message(err, "Too many sign-ups") };
  }

  let userId: string;
  try {
    const res = await auth.api.signUpEmail({ body: { email, password, name: displayName } });
    userId = res.user.id;
  } catch (err) {
    return { error: message(err, "Could not create the account") };
  }
  try {
    await createProfile(db, { userId, handle, displayName });
  } catch (err) {
    await db.deleteFrom("user").where("id", "=", userId).execute();
    return { error: message(err, "Could not create the profile") };
  }
  redirect("/news");
}

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });

export async function logIn(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password" };
  try {
    await auth.api.signInEmail({ body: parsed.data });
  } catch {
    return { error: "Wrong email or password" };
  }
  redirect("/news");
}

export async function logOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
