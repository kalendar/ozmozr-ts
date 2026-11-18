import { headers } from "next/headers";
import { getDb, type Db } from "@/db/client";
import { ValidationError } from "./errors";

/**
 * Counts one use of `key` in the current fixed window and reports whether it
 * is still within `limit`. Backed by Postgres, so it holds across processes.
 */
export async function rateLimit(db: Db, key: string, limit: number, windowSeconds: number, now: Date = new Date()): Promise<boolean> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const row = await db
    .insertInto("rate_limits")
    .values({ key, window_start: windowStart, count: 1 })
    .onConflict((oc) => oc.columns(["key", "window_start"]).doUpdateSet((eb) => ({ count: eb("rate_limits.count", "+", 1) })))
    .returning("count")
    .executeTakeFirstOrThrow();
  if (row.count === 1) {
    await db.deleteFrom("rate_limits").where("key", "=", key).where("window_start", "<", windowStart).execute();
  }
  return row.count <= limit;
}

export const LIMITS = {
  feedAdd: { limit: 30, label: "feeds" },
  opmlImport: { limit: 5, label: "imports" },
  save: { limit: 60, label: "saved links" },
  comment: { limit: 60, label: "comments" },
  signup: { limit: 10, label: "sign-ups" },
  login: { limit: 10, label: "login attempts" },
  loginAddress: { limit: 50, label: "login attempts" },
} as const;

function limitsDisabled(): boolean {
  return process.env.OZMOZR_RATE_LIMITS === "off" && process.env.NODE_ENV !== "production";
}

/** Counts one attempt of `kind` by `subject` this hour; false once the allowance is used up. */
export async function allowAttempt(db: Db, kind: keyof typeof LIMITS, subject: string, now: Date = new Date()): Promise<boolean> {
  return rateLimit(db, `${kind}:${subject.trim().toLowerCase()}`, LIMITS[kind].limit, 3600, now);
}

/** Throws a ValidationError when `subject` has used up this hour's allowance for `kind`. */
export async function enforceLimit(kind: keyof typeof LIMITS, subject: string): Promise<void> {
  if (limitsDisabled()) return;
  if (!(await allowAttempt(getDb(), kind, subject))) {
    throw new ValidationError(`That is a lot of ${LIMITS[kind].label} in one hour. Please try again later.`);
  }
}

/**
 * The client address as reported by the reverse proxy in front of the app: the
 * LAST X-Forwarded-For entry is the one our proxy appended; earlier entries
 * are whatever the client chose to send. Without a proxy this is "unknown",
 * and per-address limits then apply to everyone together.
 */
export function addressFromHeaders(h: Headers): string {
  const forwarded = h.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  return forwarded[forwarded.length - 1] ?? h.get("x-real-ip")?.trim() ?? "unknown";
}

export async function clientAddress(): Promise<string> {
  return addressFromHeaders(await headers());
}
