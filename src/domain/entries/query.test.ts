import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { getEntry } from "./query";

test("loads one entry with its content, or null", () =>
  withTestDb(async (db) => {
    const feed = await db.insertInto("feeds").values({ url: "https://a.example/f", title: "A" }).returning("id").executeTakeFirstOrThrow();
    const row = await db
      .insertInto("entries")
      .values({ feed_id: feed.id, guid: "1", title: "T", content_html: "<p>Body</p>", author: "Ada" })
      .returning("id")
      .executeTakeFirstOrThrow();
    expect(await getEntry(db, row.id)).toMatchObject({ id: row.id, title: "T", feedTitle: "A", contentHtml: "<p>Body</p>", author: "Ada", tags: [] });
    expect(await getEntry(db, row.id + 1)).toBeNull();
  }));
