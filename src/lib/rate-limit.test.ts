import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { rateLimit } from "./rate-limit";

const at = (iso: string) => new Date(iso);

test("allows up to the limit inside one window, then refuses", () =>
  withTestDb(async (db) => {
    const now = at("2026-11-17T12:10:00Z");
    for (let i = 1; i <= 30; i++) expect(await rateLimit(db, "feeds:alice", 30, 3600, now)).toBe(true);
    expect(await rateLimit(db, "feeds:alice", 30, 3600, now)).toBe(false);
    expect(await rateLimit(db, "feeds:alice", 30, 3600, at("2026-11-17T12:59:59Z"))).toBe(false);
  }));

test("a new window starts fresh, and keys are independent", () =>
  withTestDb(async (db) => {
    const now = at("2026-11-17T12:10:00Z");
    expect(await rateLimit(db, "k:a", 1, 3600, now)).toBe(true);
    expect(await rateLimit(db, "k:a", 1, 3600, now)).toBe(false);
    expect(await rateLimit(db, "k:b", 1, 3600, now)).toBe(true);
    expect(await rateLimit(db, "k:a", 1, 3600, at("2026-11-17T13:00:00Z"))).toBe(true);
  }));

test("old windows are cleaned up as new ones are written", () =>
  withTestDb(async (db) => {
    await rateLimit(db, "k:a", 5, 3600, at("2026-11-10T12:00:00Z"));
    await rateLimit(db, "k:a", 5, 3600, at("2026-11-17T12:00:00Z"));
    expect(await db.selectFrom("rate_limits").selectAll().where("key", "=", "k:a").execute()).toHaveLength(1);
  }));
