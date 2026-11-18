import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeUser } from "@/db/test-helpers";
import { parseFeed } from "@/domain/feeds/parse";
import { getProfileByUserId, getUserIdByFeedKey } from "@/domain/people/profiles";
import type { NewsItem } from "./repo";
import { renderNewsRss } from "./rss";

const item = (over: Partial<NewsItem>): NewsItem => ({
  id: 1, feedId: 1, feedTitle: "Blog", url: "https://blog.example/a?x=1&y=2", title: "Plain", summary: "Sum",
  publishedAt: new Date("2026-11-16T10:00:00Z"), tags: ["oer"], read: false, myTags: [], ...over,
});

test("renders a feed that our own parser reads back", () => {
  const xml = renderNewsRss(
    [item({}), item({ id: 2, title: 'Tom & "Jerry"', url: null, summary: "a < b & c" })],
    { title: "Ada's news", link: "https://ozmozr.example/news" },
  );
  const feed = parseFeed(xml, "https://ozmozr.example/news.rss");
  expect(feed.title).toBe("Ada's news");
  expect(feed.items.map((i) => i.title)).toEqual(["Plain", 'Tom & "Jerry"']);
  expect(feed.items[0]!.url).toBe("https://blog.example/a?x=1&y=2");
  expect(feed.items[0]!.publishedAt?.toISOString()).toBe("2026-11-16T10:00:00.000Z");
  expect(feed.items[0]!.categories).toEqual(["oer"]);
  expect(feed.items[1]!.url).toBe("https://ozmozr.example/e/2");
  expect(feed.items[1]!.summary).toBe("a < b & c");
});

test("escapes markup characters in titles", () => {
  const xml = renderNewsRss([item({ title: "<script>alert(1)</script> & co" })], { title: "T", link: "https://o.example/news" });
  expect(xml).toContain("<title>&lt;script&gt;alert(1)&lt;/script&gt; &amp; co</title>");
  expect(xml).not.toContain("<script>");
});

test("a feed key identifies its owner; wrong or empty keys identify nobody", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const profile = await getProfileByUserId(db, alice);
    expect(await getUserIdByFeedKey(db, profile!.feed_key)).toBe(alice);
    expect(await getUserIdByFeedKey(db, "wrong")).toBeNull();
    expect(await getUserIdByFeedKey(db, "")).toBeNull();
  }));
