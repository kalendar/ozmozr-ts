import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/test-db";
import { makeUser } from "@/db/test-helpers";
import { UnsafeUrlError } from "@/lib/safe-fetch";
import { harvestFeed } from "./harvest";
import {
  dueFeedIds, enqueueHarvest, getFeed, getSubscription, listFeedEntries, listFeeds, subscribeToUrl, unsubscribe,
} from "./repo";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
let server: http.Server;
let base: string;
const opts = { allowPrivateHosts: ["127.0.0.1"] };
const now = new Date("2026-11-17T12:00:00Z");

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/rss") return void res.end(fixture("rss2.xml"));
    if (req.url === "/atom") return void res.end(fixture("atom.xml"));
    if (req.url === "/rdf") return void res.end(fixture("rdf.xml"));
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const sub = (db: Db, userId: string, path: string, tags: string[] = [], title?: string) =>
  subscribeToUrl(db, userId, { url: `${base}${path}`, tags, title }, opts);

test("two people subscribing to one address share one feed", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const first = await sub(db, alice, "/rss");
    const second = await sub(db, bobby, "/rss");
    expect(first.created).toBe(true);
    expect(second).toEqual({ feedId: first.feedId, created: false });
    const feed = await getFeed(db, first.feedId, alice);
    expect(feed).toMatchObject({ title: "Open Content & Friends", subscriberCount: 2, subscribed: true });
  }));

test("subscribing again replaces the tags and title instead of duplicating", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const { feedId } = await sub(db, alice, "/rss", ["oer", "blogs"], "First name");
    await sub(db, alice, "/rss", ["oer", "reading"], "Second name");
    const mine = await getSubscription(db, alice, feedId);
    expect(mine).toEqual({ title: "Second name", tags: ["oer", "reading"] });
    expect(await db.selectFrom("subscriptions").selectAll().where("feed_id", "=", feedId).execute()).toHaveLength(1);
  }));

test("refuses private addresses", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    await expect(subscribeToUrl(db, alice, { url: "http://169.254.169.254/", tags: [] })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(await db.selectFrom("feeds").selectAll().where("kind", "=", "rss").execute()).toHaveLength(0);
  }));

test("lists feeds by popularity, newest or title, flagging the asker's subscriptions", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const rss = await sub(db, alice, "/rss"); // "Open Content & Friends"
    await sub(db, bobby, "/rss");
    const atom = await sub(db, bobby, "/atom"); // "Atom Example"
    const rdf = await sub(db, alice, "/rdf"); // "RDF Site"

    const popular = await listFeeds(db, { userId: alice, sort: "popular", page: 1 });
    expect(popular.map((f) => f.id)).toEqual([rss.feedId, atom.feedId, rdf.feedId]);
    expect(popular.map((f) => f.subscriberCount)).toEqual([2, 1, 1]);
    expect(popular.map((f) => f.subscribed)).toEqual([true, false, true]);

    const alpha = await listFeeds(db, { sort: "alpha", page: 1 });
    expect(alpha.map((f) => f.title)).toEqual(["Atom Example", "Open Content & Friends", "RDF Site"]);
    expect(alpha.every((f) => f.subscribed === false)).toBe(true);

    const newest = await listFeeds(db, { sort: "new", page: 1 });
    expect(newest.map((f) => f.id)).toEqual([rdf.feedId, atom.feedId, rss.feedId]);
    expect(await listFeeds(db, { sort: "new", page: 2 })).toEqual([]);
  }));

test("personal bookmark feeds are not listed", () =>
  withTestDb(async (db) => {
    await makeUser(db, "alice");
    expect(await listFeeds(db, { sort: "popular", page: 1 })).toEqual([]);
  }));

test("a tag filter keeps feeds that carry every tag", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const rss = await sub(db, alice, "/rss", ["oer", "blogs"]);
    await sub(db, alice, "/atom", ["oer"]);
    await sub(db, bobby, "/rdf", ["blogs"]);
    const both = await listFeeds(db, { sort: "alpha", tags: ["oer", "blogs"], page: 1 });
    expect(both.map((f) => f.id)).toEqual([rss.feedId]);
    expect(await listFeeds(db, { sort: "alpha", tags: ["oer"], page: 1 })).toHaveLength(2);
  }));

test("lists a feed's entries newest first, with their tags, optionally filtered", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const { feedId } = await sub(db, alice, "/rss");
    await harvestFeed(db, feedId, now, opts);
    const entries = await listFeedEntries(db, feedId, { page: 1 });
    expect(entries.map((e) => e.title)).toEqual(["First post", "Second post", "Third post"]);
    expect(entries[0]).toMatchObject({ feedId, feedTitle: "Open Content & Friends", tags: ["oer", "open education"] });
    expect(entries[1]!.tags).toEqual([]);
    const tagged = await listFeedEntries(db, feedId, { tags: ["oer", "open education"], page: 1 });
    expect(tagged.map((e) => e.title)).toEqual(["First post"]);
    expect(await listFeedEntries(db, feedId, { tags: ["oer", "nope"], page: 1 })).toEqual([]);
  }));

test("unsubscribing removes only that person's subscription", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const { feedId } = await sub(db, alice, "/rss", ["oer"]);
    await sub(db, bobby, "/rss");
    await unsubscribe(db, alice, feedId);
    expect(await getSubscription(db, alice, feedId)).toBeNull();
    expect((await getFeed(db, feedId, bobby))?.subscribed).toBe(true);
  }));

test("due feeds are rss feeds whose refresh time has passed, oldest first", () =>
  withTestDb(async (db) => {
    await makeUser(db, "alice"); // owns a bookmarks feed, which is never due
    const mk = (url: string, next: string) =>
      db.insertInto("feeds").values({ url, next_refresh_at: next }).returning("id").executeTakeFirstOrThrow();
    const late = await mk("https://a.example/f", "2026-11-17T11:00:00Z");
    const later = await mk("https://b.example/f", "2026-11-17T11:30:00Z");
    const future = await mk("https://c.example/f", "2026-11-17T13:00:00Z");
    expect(await dueFeedIds(db, now, 10)).toEqual([late.id, later.id]);
    expect(await dueFeedIds(db, now, 1)).toEqual([late.id]);
    await enqueueHarvest(db, future.id, now);
    expect(await dueFeedIds(db, now, 10)).toContain(future.id);
  }));
