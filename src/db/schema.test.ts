import { sql } from "kysely";
import { expect, test } from "vitest";
import { expectDbError, withTestDb } from "./test-db";

test("two feeds cannot share a url", () =>
  withTestDb(async (db) => {
    await db.insertInto("feeds").values({ url: "https://a.example/feed" }).execute();
    const msg = await expectDbError(db, (d) =>
      d.insertInto("feeds").values({ url: "https://a.example/feed" }).execute(),
    );
    expect(msg).toMatch(/unique/i);
  }));

test("two entries in one feed cannot share a guid", () =>
  withTestDb(async (db) => {
    const feed = await db.insertInto("feeds").values({ url: "https://b.example/feed" }).returning("id").executeTakeFirstOrThrow();
    const entry = { feed_id: feed.id, guid: "g1", title: "One" };
    await db.insertInto("entries").values(entry).execute();
    const msg = await expectDbError(db, (d) => d.insertInto("entries").values(entry).execute());
    expect(msg).toMatch(/unique/i);
  }));

test("a source tag (null user) can be linked to an entry only once", () =>
  withTestDb(async (db) => {
    const feed = await db.insertInto("feeds").values({ url: "https://c.example/feed" }).returning("id").executeTakeFirstOrThrow();
    const entry = await db.insertInto("entries").values({ feed_id: feed.id, guid: "g1", title: "One" }).returning("id").executeTakeFirstOrThrow();
    const tag = await db.insertInto("tags").values({ name: "oer" }).returning("id").executeTakeFirstOrThrow();
    const link = { entry_id: entry.id, tag_id: tag.id, user_id: null };
    await db.insertInto("entry_tags").values(link).execute();
    const msg = await expectDbError(db, (d) => d.insertInto("entry_tags").values(link).execute());
    expect(msg).toMatch(/unique/i);
  }));

test("ids come back as numbers", () =>
  withTestDb(async (db) => {
    const feed = await db.insertInto("feeds").values({ url: "https://d.example/feed" }).returning("id").executeTakeFirstOrThrow();
    expect(typeof feed.id).toBe("number");
    const { n } = await db.selectFrom("feeds").select(sql<number>`count(*)`.as("n")).executeTakeFirstOrThrow();
    expect(typeof n).toBe("number");
  }));
