import { FeedNotFoundError } from "@/domain/feeds/discover";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { FetchLimitError, UnsafeUrlError } from "./safe-fetch";

export type FormState = { error?: string; ok?: string };

/** Turns an expected failure into a message for the form; rethrows anything else. */
export function failure(err: unknown): FormState {
  if (
    err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError ||
    err instanceof UnsafeUrlError || err instanceof FetchLimitError || err instanceof FeedNotFoundError
  ) {
    return { error: err.message };
  }
  throw err;
}

export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function formId(form: FormData, key: string): number {
  const raw = formString(form, key);
  if (!/^\d{1,15}$/.test(raw)) throw new ValidationError("Something was missing from that request");
  return Number(raw);
}
