import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/test-db";
import { makeUser } from "@/db/test-helpers";
import { harvestFeed, nextRefreshDelayMinutes } from "./harvest";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
let server: http.Server;
let base: string;
const opts = { allowPrivateHosts: ["127.0.0.1"] };
const now = new Date("2026-11-17T12:00:00Z");

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/rss") {
      if (req.headers["if-none-match"] === '"v1"') {
        res.writeHead(304);
        return void res.end();
      }
      res.writeHead(200, { etag: '"v1"', "last-modified": "Mon, 16 Nov 2026 10:00:00 GMT" });
      return void res.end(fixture("rss2.xml"));
    }
    if (req.url === "/plain") return void res.end(fixture("rss2.xml"));
    if (req.url === "/nodates") return void res.end(fixture("nodates.xml"));
    if (req.url === "/future") {
      return void res.end(
        '<rss version="2.0"><channel><title>F</title><item><title>Tomorrow</title><guid>f1</guid>' +
          "<pubDate>Tue, 17 Nov 2099 10:00:00 GMT</pubDate></item></channel></rss>",
      );
    }
    if (req.url === "/broken") return void res.end(fixture("truncated.xml"));
    if (req.url === "/boom") {
      res.writeHead(500);
      return void res.end("oops");
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

async function makeFeed(db: Db, path: string, extra: { title?: string; failure_count?: number } = {}): Promise<number> {
  const row = await db.insertInto("feeds").values({ url: `${base}${path}`, ...extra }).returning("id").executeTakeFirstOrThrow();
  return row.id;
}
const getFeed = (db: Db, id: number) => db.selectFrom("feeds").selectAll().where("id", "=", id).executeTakeFirstOrThrow();

test("stores new entries once, however often the feed is harvested", () =>
  withTestDb(async (db) => {
    const id = await makeFeed(db, "/plain");
    expect(await harvestFeed(db, id, now, opts)).toEqual({ status: "updated", newEntries: 3 });
    expect(await harvestFeed(db, id, now, opts)).toEqual({ status: "updated", newEntries: 0 });
    const entries = await db.selectFrom("entries").selectAll().where("feed_id", "=", id).execute();
    expect(entries).toHaveLength(3);
  }));

test("fills in feed details and schedules the next refresh in an hour", () =>
  withTestDb(async (db) => {
    const id = await makeFeed(db, "/rss", { failure_count: 3 });
    await harvestFeed(db, id, now, opts);
    const feed = await getFeed(db, id);
    expect(feed.title).toBe("Open Content & Friends");
    expect(feed.description).toBe("Notes on open education");
    expect(feed.site_url).toBe("https://blog.example/");
    expect(feed.etag).toBe('"v1"');
    expect(feed.failure_count).toBe(0);
    expect(feed.last_error).toBeNull();
    expect(feed.refreshed_at?.toISOString()).toBe(now.toISOString());
    expect(feed.next_refresh_at.toISOString()).toBe("2026-11-17T13:00:00.000Z");
  }));

test("keeps a title that is already set", () =>
  withTestDb(async (db) => {
    const id = await makeFeed(db, "/plain", { title: "My name for it" });
    await harvestFeed(db, id, now, opts);
    expect((await getFeed(db, id)).title).toBe("My name for it");
  }));

test("an unchanged feed (304) adds nothing", () =>
  withTestDb(async (db) => {
    const id = await makeFeed(db, "/rss");
    await harvestFeed(db, id, now, opts);
    expect(await harvestFeed(db, id, now, opts)).toEqual({ status: "not-modified", newEntries: 0 });
    expect((await getFeed(db, id)).failure_count).toBe(0);
  }));

test("a server error is counted and backs off", () =>
  withTestDb(async (db) => {
    const id = await makeFeed(db, "/boom");
    expect(await harvestFeed(db, id, now, opts)).toEqual({ status: "failed", newEntries: 0 });
    const feed = await getFeed(db, id);
    expect(feed.failure_count).toBe(1);
    expect(feed.last_error).toMatch(/500/);
    expect(feed.next_refresh_at.toISOString()).toBe("2026-11-17T14:00:00.000Z");
  }));

test("backoff doubles per failure and is capped", () => {
  expect([0, 1, 6, 20].map(nextRefreshDelayMinutes)).toEqual([60, 120, 3840, 3840]);
});

test("an oversized or malformed feed fails without throwing", () =>
  withTestDb(async (db) => {
    const big = await makeFeed(db, "/plain");
    expect((await harvestFeed(db, big, now, { ...opts, maxBytes: 100 })).status).toBe("failed");
    const broken = await makeFeed(db, "/broken");
    expect((await harvestFeed(db, broken, now, opts)).status).toBe("failed");
    expect((await getFeed(db, broken)).last_error).toMatch(/well-formed/);
    expect(await db.selectFrom("entries").selectAll().execute()).toHaveLength(0);
  }));

test("feed categories become source tags, created once", () =>
  withTestDb(async (db) => {
    await db.insertInto("tags").values({ name: "oer" }).execute();
    const id = await makeFeed(db, "/plain");
    await harvestFeed(db, id, now, opts);
    const tags = await db.selectFrom("tags").select("name").orderBy("name").execute();
    expect(tags.map((t) => t.name)).toEqual(["oer", "open education"]);
    const links = await db
      .selectFrom("entry_tags")
      .innerJoin("tags", "tags.id", "entry_tags.tag_id")
      .innerJoin("entries", "entries.id", "entry_tags.entry_id")
      .select(["tags.name", "entry_tags.user_id", "entries.guid"])
      .execute();
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.user_id === null && l.guid === "tag:blog.example,2026:1")).toBe(true);
  }));

test("undated and future-dated items are dated now", () =>
  withTestDb(async (db) => {
    const undated = await makeFeed(db, "/nodates");
    const future = await makeFeed(db, "/future");
    await harvestFeed(db, undated, now, opts);
    await harvestFeed(db, future, now, opts);
    const entries = await db.selectFrom("entries").select("published_at").execute();
    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.published_at.toISOString() === now.toISOString())).toBe(true);
  }));

test("bookmark feeds are never fetched", () =>
  withTestDb(async (db) => {
    await makeUser(db, "alice");
    const feed = await db.selectFrom("feeds").select("id").where("kind", "=", "bookmarks").executeTakeFirstOrThrow();
    expect(await harvestFeed(db, feed.id, now, opts)).toEqual({ status: "skipped", newEntries: 0 });
  }));

test("a missing feed is skipped", () =>
  withTestDb(async (db) => {
    expect(await harvestFeed(db, 999_999, now, opts)).toEqual({ status: "skipped", newEntries: 0 });
  }));
