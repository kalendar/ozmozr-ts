import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { addressFromHeaders, allowAttempt } from "./rate-limit";

const h = (init: Record<string, string>) => new Headers(init);

test("uses the address appended by our own proxy, not one the client sent", () => {
  expect(addressFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  expect(addressFromHeaders(h({ "x-forwarded-for": " 198.51.100.4 " }))).toBe("198.51.100.4");
  expect(addressFromHeaders(h({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  expect(addressFromHeaders(h({}))).toBe("unknown");
});

test("the eleventh login attempt for one account in an hour is refused", () =>
  withTestDb(async (db) => {
    const now = new Date("2026-11-17T12:10:00Z");
    for (let i = 0; i < 10; i++) expect(await allowAttempt(db, "login", "ada@example.test", now)).toBe(true);
    expect(await allowAttempt(db, "login", "ada@example.test", now)).toBe(false);
    expect(await allowAttempt(db, "login", "ADA@example.test ", now)).toBe(false); // same account
    expect(await allowAttempt(db, "login", "bob@example.test", now)).toBe(true);
  }));
