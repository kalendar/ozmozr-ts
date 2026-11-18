import Link from "next/link";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { signUp } from "../actions";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="h1 mb-6">Create your account</h1>
      <ActionForm action={signUp}>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Display name" name="displayName" autoComplete="name" required maxLength={80} />
        <Field
          label="Handle"
          name="handle"
          required
          pattern="[a-z0-9_]{3,30}"
          hint="Your public address: lowercase letters, numbers and underscores."
        />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
        <SubmitButton>Sign up</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        Already have an account? <Link href="/login" className="link">Log in</Link>
      </p>
    </div>
  );
}
