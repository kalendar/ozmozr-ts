import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeUser } from "@/db/test-helpers";
import { ValidationError } from "@/lib/errors";
import { importOpml, listSubscriptionsForExport, parseOpml, renderOpml } from "./opml";
import { getSubscription } from "./repo";

const legacy = readFileSync(new URL("./fixtures/short.opml", import.meta.url), "utf8");

test("reads every outline that has a feed address, tagging it with its folder", () => {
  const feeds = parseOpml(legacy);
  expect(feeds).toHaveLength(4);
  expect(feeds[0]).toEqual({ url: "http://boingboing.net/rss.xml", title: "Boing Boing", tags: ["fun"] });
  expect(feeds.every((f) => f.tags.length === 1 && f.tags[0] === "fun")).toBe(true);
});

test("nested folders each become a tag; outlines without an address are ignored", () => {
  const xml = `<opml version="2.0"><body>
    <outline text="Tech"><outline text="Ruby">
      <outline text="Blog" xmlUrl="https://ruby.example/feed" category="lang, Open Source"/>
      <outline text="Just a note"/>
    </outline></outline>
    <outline text="Top level" xmlUrl="https://top.example/feed"/>
  </body></opml>`;
  expect(parseOpml(xml)).toEqual([
    { url: "https://ruby.example/feed", title: "Blog", tags: ["tech", "ruby", "lang", "open source"] },
    { url: "https://top.example/feed", title: "Top level", tags: [] },
  ]);
});

test("rejects files that are not OPML", () => {
  expect(() => parseOpml("<html><body>hi</body></html>")).toThrow(ValidationError);
  expect(() => parseOpml("garbage")).toThrow(ValidationError);
});

test("export round-trips through import parsing, escaping special characters", () => {
  const subs = [
    { url: "https://a.example/feed?x=1&y=2", title: 'Tom & "Jerry" <3', tags: ["open education", "oer"] },
    { url: "https://b.example/feed", title: "", tags: [] },
  ];
  expect(parseOpml(renderOpml(subs))).toEqual(subs);
});

test("import subscribes without fetching, and re-importing skips everything", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    expect(await importOpml(db, alice, legacy)).toEqual({ added: 4, skipped: 0, failed: [] });
    expect(await importOpml(db, alice, legacy)).toEqual({ added: 0, skipped: 4, failed: [] });
    const feed = await db.selectFrom("feeds").selectAll().where("url", "=", "http://boingboing.net/rss.xml").executeTakeFirstOrThrow();
    expect(feed.title).toBe("Boing Boing");
    expect(feed.refreshed_at).toBeNull();
    expect(await getSubscription(db, alice, feed.id)).toEqual({ title: "", tags: ["fun"] });
    const exported = await listSubscriptionsForExport(db, alice);
    expect(exported).toHaveLength(4); // the personal bookmarks feed is not exported
    expect(exported[0]).toEqual({ url: "http://boingboing.net/rss.xml", title: "Boing Boing", tags: ["fun"] });
  }));

test("entries with unusable addresses are reported, not imported", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const xml = `<opml><body>
      <outline text="Good" xmlUrl="https://good.example/feed"/>
      <outline text="Ftp" xmlUrl="ftp://bad.example/feed"/>
      <outline text="Junk" xmlUrl="not a url"/>
    </body></opml>`;
    const result = await importOpml(db, alice, xml);
    expect(result.added).toBe(1);
    expect(result.failed.map((f) => f.url)).toEqual(["ftp://bad.example/feed", "not a url"]);
  }));

test("only the first 500 feeds of a huge file are imported", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const outlines = Array.from({ length: 503 }, (_, i) => `<outline text="F${i}" xmlUrl="https://f${i}.example/feed"/>`).join("");
    const result = await importOpml(db, alice, `<opml><body>${outlines}</body></opml>`);
    expect(result.added).toBe(500);
    expect(result.failed).toHaveLength(3);
    expect(result.failed[0]!.reason).toMatch(/500/);
  }));
