import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { saveLink } from "@/domain/bookmarks/repo";
import { getBookmarkFeedOwnerHandle } from "@/domain/people/profiles";
import { extractEventsForEntry, listUpcomingEvents } from "./repo";

let server: http.Server;
let base: string;
let hits = 0;
let failNext = false;
const opts = { allowPrivateHosts: ["127.0.0.1"] };
const now = new Date("2026-11-17T12:00:00Z");

beforeAll(async () => {
  const html = readFileSync(new URL("./fixtures/concert.html", import.meta.url), "utf8");
  server = http.createServer((_req, res) => {
    hits += 1;
    if (failNext) {
      failNext = false;
      res.writeHead(503);
      return void res.end();
    }
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

test("events are found for a saved page that a feed had already delivered, and it is fetched only once", () =>
  withTestDb(async (db) => {
    hits = 0;
    const alice = await makeUser(db, "alice");
    const feed = await makeFeed(db, "https://venue.example/feed");
    const delivered = await makeEntry(db, feed, { title: "Gig", url: `${base}/gig` });
    const saved = await saveLink(db, alice, { url: `${base}/gig`, title: "Gig", tags: [] });
    expect(saved).toEqual({ entryId: delivered, created: false });

    expect(await extractEventsForEntry(db, delivered, opts, now)).toBe(1);
    expect((await listUpcomingEvents(db, alice, { now })).map((e) => e.name)).toEqual(["The Quaggas Live"]);
    expect(await extractEventsForEntry(db, delivered, opts, now)).toBe(0);
    expect(hits).toBe(1);
    // A day later the page is looked at again.
    await extractEventsForEntry(db, delivered, opts, new Date(now.getTime() + 25 * 3_600_000));
    expect(hits).toBe(2);
  }));

test("a failed fetch is retried on the next save", () =>
  withTestDb(async (db) => {
    hits = 0;
    failNext = true;
    const alice = await makeUser(db, "alice");
    const { entryId } = await saveLink(db, alice, { url: `${base}/flaky`, title: "Flaky", tags: [] });
    expect(await extractEventsForEntry(db, entryId, opts, now)).toBe(0);
    expect(await extractEventsForEntry(db, entryId, opts, now)).toBe(1);
    expect(hits).toBe(2);
  }));

test("a personal bookmarks feed leads to its owner's profile", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const rss = await makeFeed(db, "https://blog.example/feed");
    const bookmarks = await db.selectFrom("profiles").select("bookmark_feed_id").where("user_id", "=", alice).executeTakeFirstOrThrow();
    expect(await getBookmarkFeedOwnerHandle(db, bookmarks.bookmark_feed_id!)).toBe("alice");
    expect(await getBookmarkFeedOwnerHandle(db, rss)).toBeNull();
  }));
