import { expect, test } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { saveLink } from "@/domain/bookmarks/repo";
import { setEntryTags } from "@/domain/tags/repo";
import { globalTagCloud, listEntriesByTags, search } from "./repo";

async function seed(db: Db) {
  const feed = await makeFeed(db, "https://blog.example/feed", "Open Education Weekly");
  const inTitle = await makeEntry(db, feed, { title: "Open education for all", publishedAt: "2026-11-01T00:00:00Z" });
  const inBody = await makeEntry(db, feed, { title: "Something else", publishedAt: "2026-11-05T00:00:00Z" });
  await db.updateTable("entries").set({ content_html: "<p>Notes on <b>open</b> and distance education</p>" }).where("id", "=", inBody).execute();
  const unrelated = await makeEntry(db, feed, { title: "Gardening tips" });
  return { feed, inTitle, inBody, unrelated };
}

test("entries with the words in the title rank above those with them only in the body", () =>
  withTestDb(async (db) => {
    const s = await seed(db);
    const result = await search(db, "open education", { type: "entries", page: 1 });
    expect(result.type).toBe("entries");
    expect(result.items.map((e) => e.id)).toEqual([s.inTitle, s.inBody]);
  }));

test("markup in content is not searchable text", () =>
  withTestDb(async (db) => {
    await seed(db);
    expect((await search(db, "<b>", { type: "entries", page: 1 })).items).toEqual([]);
  }));

test("empty and punctuation-only queries return nothing without error", () =>
  withTestDb(async (db) => {
    await seed(db);
    for (const q of ["", "   ", "!!!", "-", '"', "the"]) {
      expect((await search(db, q, { type: "entries", page: 1 })).items).toEqual([]);
    }
  }));

test("finds feeds and people", () =>
  withTestDb(async (db) => {
    const s = await seed(db);
    await makeUser(db, "alice");
    const user = await makeUser(db, "ada_lovelace");
    await db.updateTable("profiles").set({ display_name: "Ada Lovelace", blurb: "Analytical engines and mathematics" }).where("user_id", "=", user).execute();
    const feeds = await search(db, "education", { type: "feeds", page: 1 });
    expect(feeds.items.map((f) => f.id)).toEqual([s.feed]);
    expect((await search(db, "saved links", { type: "feeds", page: 1 })).items).toEqual([]); // bookmark feeds are hidden
    const byName = await search(db, "lovelace", { type: "people", page: 1 });
    expect(byName.items.map((p) => p.handle)).toEqual(["ada_lovelace"]);
    expect((await search(db, "ada_lo", { type: "people", page: 1 })).items.map((p) => p.handle)).toEqual(["ada_lovelace"]);
    expect((await search(db, "mathematics", { type: "people", page: 1 })).items).toHaveLength(1);
    expect((await search(db, "anything", { type: "groups", page: 1 })).items).toEqual([]);
  }));

test("browsing by tags needs every tag, from the feed or from anyone, across all feeds", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const feed = await makeFeed(db, "https://blog.example/feed", "Blog");
    const both = await makeEntry(db, feed, { title: "Both", publishedAt: "2026-11-02T00:00:00Z", tags: ["a"] });
    await setEntryTags(db, alice, both, ["b"]);
    await makeEntry(db, feed, { title: "Only a", tags: ["a"] });
    const saved = await saveLink(db, alice, { url: "https://example.org/x", title: "Saved", tags: ["a", "b"] });
    const found = await listEntriesByTags(db, ["a", "b"], { page: 1 });
    expect(found.map((e) => e.id).sort()).toEqual([both, saved.entryId].sort());
    expect(await listEntriesByTags(db, [], { page: 1 })).toEqual([]);
  }));

test("the global tag cloud counts entries per tag", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const feed = await makeFeed(db, "https://blog.example/feed");
    const e1 = await makeEntry(db, feed, { title: "One", tags: ["oer"] });
    const e2 = await makeEntry(db, feed, { title: "Two", tags: ["rss"] });
    await setEntryTags(db, alice, e1, ["oer"]);
    await setEntryTags(db, bobby, e2, ["oer"]);
    expect(await globalTagCloud(db)).toEqual([{ name: "oer", count: 2 }, { name: "rss", count: 1 }]);
    expect(await globalTagCloud(db, 1)).toEqual([{ name: "oer", count: 2 }]);
  }));
