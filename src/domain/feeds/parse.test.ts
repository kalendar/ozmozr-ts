import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { FeedParseError, parseFeed } from "./parse";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("parses an RSS 2.0 feed", () => {
  const feed = parseFeed(fixture("rss2.xml"), "https://blog.example/feed");
  expect(feed.title).toBe("Open Content & Friends");
  expect(feed.description).toBe("Notes on open education");
  expect(feed.siteUrl).toBe("https://blog.example/");
  expect(feed.items).toHaveLength(3);
  const [first, second] = feed.items;
  expect(first).toMatchObject({
    guid: "tag:blog.example,2026:1",
    url: "https://blog.example/first",
    title: "First post",
    summary: "Short summary of the first post.",
    author: "David",
    categories: ["oer", "open education"],
  });
  expect(first!.publishedAt?.toISOString()).toBe("2026-11-16T10:00:00.000Z");
  expect(first!.contentHtml).toContain('<a href="https://blog.example/about"');
  expect(first!.contentHtml).not.toContain("script");
  expect(second!.url).toBe("https://blog.example/second");
  expect(second!.summary).toBe("Second summary");
  expect(second!.contentHtml).toBe("<p>Second <em>summary</em></p>");
});

test("parses an Atom feed", () => {
  const feed = parseFeed(fixture("atom.xml"), "https://atom.example/feed.xml");
  expect(feed.title).toBe("Atom Example");
  expect(feed.description).toBe("An Atom feed");
  expect(feed.siteUrl).toBe("https://atom.example/");
  const [one, two, three] = feed.items;
  expect(one).toMatchObject({
    guid: "urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a",
    url: "https://atom.example/one",
    title: "Atom & entities",
    author: "Ada",
    categories: ["learning analytics", "data"],
    contentHtml: "<p>Escaped <strong>html</strong> content</p>",
  });
  expect(one!.publishedAt?.toISOString()).toBe("2026-11-10T08:00:00.000Z");
  expect(two!.contentHtml).toContain("<p>Real <em>markup</em> here</p>");
  expect(two!.publishedAt?.toISOString()).toBe("2026-11-09T08:00:00.000Z");
  expect(three!.summary).toBe("Just a summary.");
});

test("parses an RSS 1.0 (RDF) feed", () => {
  const feed = parseFeed(fixture("rdf.xml"), "https://rdf.example/index.rdf");
  expect(feed.title).toBe("RDF Site");
  expect(feed.items).toHaveLength(1);
  expect(feed.items[0]).toMatchObject({
    guid: "https://rdf.example/a",
    url: "https://rdf.example/a",
    title: "RDF item",
    categories: ["bookmarks"],
  });
  expect(feed.items[0]!.publishedAt?.toISOString()).toBe("2026-11-01T12:00:00.000Z");
});

test("falls back to the link, then a hash, when an item has no guid", () => {
  const { items } = parseFeed(fixture("noguid.xml"), "https://ng.example/feed");
  expect(items[0]!.guid).toBe("https://ng.example/has-link");
  const expected = createHash("sha256").update("No link at all|2026-11-16T11:00:00.000Z").digest("hex");
  expect(items[1]!.guid).toBe(expected);
  expect(items[1]!.url).toBeNull();
});

test("makes a title from the summary, or uses Untitled", () => {
  const { items } = parseFeed(fixture("noguid.xml"), "https://ng.example/feed");
  expect(items[2]!.title).toBe("This item has no title, only a rather long description that should be used to ma");
  expect(items[2]!.title).toHaveLength(80);
  expect(items[3]!.title).toBe("Untitled");
});

test("items without a usable date get a null date, and unsafe links are dropped", () => {
  const { items } = parseFeed(fixture("nodates.xml"), "https://nd.example/feed");
  expect(items.map((i) => i.publishedAt)).toEqual([null, null, null]);
  expect(items[2]!.url).toBeNull();
  expect(items[2]!.guid).toBe("3");
});

test("rejects input that is not a feed", () => {
  expect(() => parseFeed(fixture("invalid.xml"), "https://x.example/")).toThrow(FeedParseError);
  expect(() => parseFeed(fixture("page.html"), "https://x.example/")).toThrow(FeedParseError);
  expect(() => parseFeed(fixture("truncated.xml"), "https://x.example/")).toThrow(FeedParseError);
  expect(() => parseFeed("", "https://x.example/")).toThrow(FeedParseError);
});

test("oversized links are dropped, oversized guids are hashed, and NUL characters are removed", () => {
  const longUrl = `https://x.example/${"a".repeat(3000)}`;
  const longGuid = "\u00e9".repeat(1500);
  const xml = `<rss version="2.0"><channel><title>T</title>
    <item><title>Long link</title><link>${longUrl}</link><guid>${longGuid}</guid></item>
    <item><title>Nul&#x0;l title</title><guid>ok</guid><description>bo&#x0;dy</description></item>
  </channel></rss>`;
  const { items } = parseFeed(xml, "https://x.example/feed");
  expect(items[0]!.url).toBeNull();
  expect(items[0]!.guid).toMatch(/^[a-f0-9]{64}$/);
  expect(items[1]!.title).toBe("Null title");
  expect(JSON.stringify(items)).not.toContain("\\u0000");
});

test("keeps at most 500 items", () => {
  const items = Array.from({ length: 600 }, (_, i) => `<item><title>t${i}</title><guid>${i}</guid></item>`).join("");
  const feed = parseFeed(`<rss version="2.0"><channel><title>Big</title>${items}</channel></rss>`, "https://x.example/");
  expect(feed.items).toHaveLength(500);
});
