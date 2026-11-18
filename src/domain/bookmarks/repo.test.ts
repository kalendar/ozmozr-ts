import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { listNews } from "@/domain/news/repo";
import { getMyEntryTags } from "@/domain/tags/repo";
import { ValidationError } from "@/lib/errors";
import { fetchPageTitle, getSave, listSaved, saveLink, unsaveLink } from "./repo";

test("saving a new link creates an entry in my bookmarks feed and my news", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const { entryId } = await saveLink(db, alice, {
      url: "https://example.org/article", title: "An article", comment: "Read before Friday", tags: ["to read", "oer"],
    });
    const news = await listNews(db, alice, {});
    expect(news.map((n) => n.id)).toEqual([entryId]);
    expect(news[0]).toMatchObject({ title: "An article", url: "https://example.org/article", myTags: ["oer", "to read"] });
    expect(await getSave(db, alice, entryId)).toMatchObject({ comment: "Read before Friday" });
  }));

test("saving a link that a feed already delivered tags that entry instead of copying it", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const feed = await makeFeed(db, "https://blog.example/feed", "Blog");
    const existing = await makeEntry(db, feed, { title: "Post", url: "https://blog.example/post" });
    const { entryId } = await saveLink(db, alice, { url: "https://blog.example/post", title: "My title", tags: ["keep"] });
    expect(entryId).toBe(existing);
    expect(await getMyEntryTags(db, alice, existing)).toEqual(["keep"]);
    expect(await db.selectFrom("entries").selectAll().execute()).toHaveLength(1);
  }));

test("saving the same link twice keeps one entry and updates the note and tags", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const first = await saveLink(db, alice, { url: "https://example.org/a", title: "A", comment: "one", tags: ["x"] });
    const second = await saveLink(db, alice, { url: "https://example.org/a", title: "A again", comment: "two", tags: ["y"] });
    const bobs = await saveLink(db, bobby, { url: "https://example.org/a", title: "Bob's", tags: [] });
    expect(second.entryId).toBe(first.entryId);
    expect(bobs.entryId).toBe(first.entryId);
    expect(await db.selectFrom("entries").selectAll().execute()).toHaveLength(1);
    expect((await getSave(db, alice, first.entryId))?.comment).toBe("two");
    expect(await getMyEntryTags(db, alice, first.entryId)).toEqual(["y"]);
  }));

test("refuses addresses that are not web links, and empty titles fall back to the address", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    for (const url of ["javascript:alert(1)", "ftp://x.example/", "nonsense", ""]) {
      await expect(saveLink(db, alice, { url, title: "T", tags: [] })).rejects.toBeInstanceOf(ValidationError);
    }
    const { entryId } = await saveLink(db, alice, { url: "https://example.org/untitled", title: "  ", tags: [] });
    const entry = await db.selectFrom("entries").select("title").where("id", "=", entryId).executeTakeFirstOrThrow();
    expect(entry.title).toBe("https://example.org/untitled");
  }));

test("lists my saved links newest first; unsaving removes the save and my tags", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const a = await saveLink(db, alice, { url: "https://example.org/a", title: "A", tags: ["x"] });
    const b = await saveLink(db, alice, { url: "https://example.org/b", title: "B", tags: [] });
    await db.updateTable("saves").set({ created_at: "2026-01-01T00:00:00Z" } as never).where("entry_id", "=", a.entryId).execute();
    expect((await listSaved(db, alice, { page: 1 })).map((e) => e.title)).toEqual(["B", "A"]);
    await unsaveLink(db, alice, a.entryId);
    expect((await listSaved(db, alice, { page: 1 })).map((e) => e.title)).toEqual(["B"]);
    expect(await getMyEntryTags(db, alice, a.entryId)).toEqual([]);
    expect(b.entryId).not.toBe(a.entryId);
  }));

let server: http.Server;
let base: string;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/page") return void res.end("<html><head><title> A &amp; B\n page </title></head><body>x</body></html>");
    if (req.url === "/notitle") return void res.end("<html><body>x</body></html>");
    res.writeHead(500);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

test("reads a page's title, or gives null when it cannot", async () => {
  const opts = { allowPrivateHosts: ["127.0.0.1"] };
  expect(await fetchPageTitle(`${base}/page`, opts)).toBe("A & B page");
  expect(await fetchPageTitle(`${base}/notitle`, opts)).toBeNull();
  expect(await fetchPageTitle(`${base}/error`, opts)).toBeNull();
  expect(await fetchPageTitle("http://127.0.0.1:1/blocked")).toBeNull();
});
