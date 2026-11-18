import Link from "next/link";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { logIn } from "../actions";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="h1 mb-6">Log in</h1>
      <ActionForm action={logIn}>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton>Log in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        New here? <Link href="/signup" className="link">Create an account</Link>
      </p>
    </div>
  );
}
