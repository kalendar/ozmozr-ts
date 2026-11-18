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
} as const;

function limitsDisabled(): boolean {
  return process.env.OZMOZR_RATE_LIMITS === "off" && process.env.NODE_ENV !== "production";
}

/** Throws a ValidationError when `subject` has used up this hour's allowance for `kind`. */
export async function enforceLimit(kind: keyof typeof LIMITS, subject: string): Promise<void> {
  if (limitsDisabled()) return;
  const { limit, label } = LIMITS[kind];
  if (!(await rateLimit(getDb(), `${kind}:${subject}`, limit, 3600))) {
    throw new ValidationError(`That is a lot of ${label} in one hour. Please try again later.`);
  }
}

/** Best-effort client address for per-IP limits. Trust this only behind your own proxy. */
export async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
