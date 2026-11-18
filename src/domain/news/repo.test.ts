import { expect, test } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { setSubscriptionTags, subscribeToFeedUrl } from "@/domain/feeds/repo";
import { setEntryTags } from "@/domain/tags/repo";
import { listNews, markAllRead, markRead, newsTagCloud } from "./repo";

async function world(db: Db) {
  const alice = await makeUser(db, "alice");
  const bobby = await makeUser(db, "bobby");
  const blog = await makeFeed(db, "https://blog.example/feed", "Blog");
  const other = await makeFeed(db, "https://other.example/feed", "Other");
  const e1 = await makeEntry(db, blog, { title: "Old post", publishedAt: "2026-11-01T00:00:00Z", tags: ["oer"] });
  const e2 = await makeEntry(db, blog, { title: "New post", publishedAt: "2026-11-03T00:00:00Z" });
  const e3 = await makeEntry(db, other, { title: "Elsewhere", publishedAt: "2026-11-02T00:00:00Z", tags: ["oer"] });
  await subscribeToFeedUrl(db, alice, { feedUrl: "https://blog.example/feed", tags: ["rss"] });
  return { alice, bobby, blog, other, e1, e2, e3 };
}
const titles = (items: { title: string }[]) => items.map((i) => i.title);

test("shows entries from subscribed feeds only, newest first", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    expect(titles(await listNews(db, w.alice, {}))).toEqual(["New post", "Old post"]);
    expect(await listNews(db, w.bobby, {})).toEqual([]);
  }));

test("a tag filter matches entry tags and subscription tags together", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    // "oer" is on the entry (from the feed); "rss" is on alice's subscription.
    expect(titles(await listNews(db, w.alice, { tags: ["oer", "rss"] }))).toEqual(["Old post"]);
    expect(titles(await listNews(db, w.alice, { tags: ["rss"] }))).toEqual(["New post", "Old post"]);
    expect(await listNews(db, w.alice, { tags: ["oer", "missing"] })).toEqual([]);
  }));

test("my own entry tags count; other people's do not", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    await subscribeToFeedUrl(db, w.bobby, { feedUrl: "https://blog.example/feed", tags: [] });
    await setEntryTags(db, w.bobby, w.e2, ["bobs tag"]);
    await setEntryTags(db, w.alice, w.e2, ["to read"]);
    const [newPost] = await listNews(db, w.alice, {});
    expect(newPost!.myTags).toEqual(["to read"]);
    expect(newPost!.tags).toEqual(["bobs tag", "to read"]);
    expect(titles(await listNews(db, w.alice, { tags: ["to read"] }))).toEqual(["New post"]);
    expect(await listNews(db, w.alice, { tags: ["bobs tag"] })).toEqual([]);
  }));

test("read tracking: unreadOnly hides what was marked read", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    await markRead(db, w.alice, [w.e2, w.e2, 999_999]);
    const all = await listNews(db, w.alice, {});
    expect(all.map((i) => [i.title, i.read])).toEqual([["New post", true], ["Old post", false]]);
    expect(titles(await listNews(db, w.alice, { unreadOnly: true }))).toEqual(["Old post"]);
  }));

test("mark all read can be limited to a tag", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    expect(await markAllRead(db, w.alice, ["oer"])).toBe(1);
    expect(titles(await listNews(db, w.alice, { unreadOnly: true }))).toEqual(["New post"]);
    expect(await markAllRead(db, w.alice)).toBe(1);
    expect(await markAllRead(db, w.alice)).toBe(0);
    expect(await listNews(db, w.alice, { unreadOnly: true })).toEqual([]);
  }));

test("pages by cursor without losing entries that share a timestamp", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const feed = await makeFeed(db, "https://same.example/feed");
    for (let i = 1; i <= 5; i++) await makeEntry(db, feed, { title: `E${i}`, publishedAt: "2026-11-05T00:00:00Z" });
    await subscribeToFeedUrl(db, alice, { feedUrl: "https://same.example/feed", tags: [] });
    const first = await listNews(db, alice, { limit: 2 });
    const second = await listNews(db, alice, { limit: 2, before: { publishedAt: first[1]!.publishedAt, id: first[1]!.id } });
    const third = await listNews(db, alice, { limit: 2, before: { publishedAt: second[1]!.publishedAt, id: second[1]!.id } });
    expect(titles([...first, ...second, ...third])).toEqual(["E5", "E4", "E3", "E2", "E1"]);
  }));

test("changing tags on a feed you are not subscribed to does nothing", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    await setSubscriptionTags(db, w.bobby, w.blog, ["sneaky"]);
    expect(await db.selectFrom("tags").select("name").where("name", "=", "sneaky").execute()).toEqual([]);
    expect(titles(await listNews(db, w.alice, { tags: ["sneaky"] }))).toEqual([]);
  }));

test("the tag cloud counts tags across my news, sorted by name", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    await setEntryTags(db, w.alice, w.e2, ["oer", "to read"]);
    await setEntryTags(db, w.bobby, w.e2, ["not mine"]);
    expect(await newsTagCloud(db, w.alice)).toEqual([
      { name: "oer", count: 2 },
      { name: "rss", count: 1 },
      { name: "to read", count: 1 },
    ]);
    expect(await newsTagCloud(db, w.alice, 1)).toEqual([{ name: "oer", count: 2 }]);
  }));
