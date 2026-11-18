import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeBareUser } from "@/db/test-helpers";
import { ValidationError } from "@/lib/errors";
import { createProfile, getProfileByHandle, isHandleAvailable } from "./profiles";

test("rejects handles that are too short, too long, or contain other characters", () =>
  withTestDb(async (db) => {
    const userId = await makeBareUser(db, "u1");
    for (const handle of ["ab", "a".repeat(31), "has space", "Upper", "dash-ed", ""]) {
      await expect(createProfile(db, { userId, handle, displayName: "X" })).rejects.toBeInstanceOf(ValidationError);
    }
  }));

test("rejects a handle that is already taken", () =>
  withTestDb(async (db) => {
    await createProfile(db, { userId: await makeBareUser(db, "u1"), handle: "alice", displayName: "A" });
    await expect(
      createProfile(db, { userId: await makeBareUser(db, "u2"), handle: "alice", displayName: "B" }),
    ).rejects.toThrow(/taken/);
    expect(await isHandleAvailable(db, "alice")).toBe(false);
    expect(await isHandleAvailable(db, "ALICE")).toBe(false);
    expect(await isHandleAvailable(db, "bob")).toBe(true);
  }));

test("creates exactly one bookmarks feed and one subscription to it", () =>
  withTestDb(async (db) => {
    const userId = await makeBareUser(db, "u1");
    const profile = await createProfile(db, { userId, handle: "alice", displayName: "Alice" });
    const feeds = await db.selectFrom("feeds").selectAll().where("kind", "=", "bookmarks").execute();
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.url).toBe("ozmozr:bookmarks:u1");
    expect(profile.bookmark_feed_id).toBe(feeds[0]!.id);
    const subs = await db.selectFrom("subscriptions").selectAll().where("user_id", "=", userId).execute();
    expect(subs.map((s) => s.feed_id)).toEqual([feeds[0]!.id]);
  }));

test("gives each profile its own unguessable feed key", () =>
  withTestDb(async (db) => {
    const a = await createProfile(db, { userId: await makeBareUser(db, "u1"), handle: "alice", displayName: "A" });
    const b = await createProfile(db, { userId: await makeBareUser(db, "u2"), handle: "bobby", displayName: "B" });
    expect(a.feed_key).not.toBe(b.feed_key);
    expect(a.feed_key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  }));

test("finds a profile by handle, ignoring case", () =>
  withTestDb(async (db) => {
    await createProfile(db, { userId: await makeBareUser(db, "u1"), handle: "alice", displayName: "Alice" });
    expect((await getProfileByHandle(db, "Alice"))?.display_name).toBe("Alice");
    expect(await getProfileByHandle(db, "nobody")).toBeNull();
  }));
