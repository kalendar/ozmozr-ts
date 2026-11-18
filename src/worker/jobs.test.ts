import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { enqueueDueFeeds } from "./jobs";

test("queues one harvest per due feed", () =>
  withTestDb(async (db) => {
    const now = new Date("2026-11-17T12:00:00Z");
    const due = await db.insertInto("feeds").values({ url: "https://a.example/f", next_refresh_at: "2026-11-17T11:00:00Z" }).returning("id").executeTakeFirstOrThrow();
    await db.insertInto("feeds").values({ url: "https://b.example/f", next_refresh_at: "2026-11-17T13:00:00Z" }).execute();
    const sent: number[] = [];
    const count = await enqueueDueFeeds(db, async (feedId) => void sent.push(feedId), now);
    expect(count).toBe(1);
    expect(sent).toEqual([due.id]);
  }));
