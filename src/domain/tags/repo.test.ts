import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { NotFoundError } from "@/lib/errors";
import { getMyEntryTags, setEntryTags, suggestTags } from "./repo";

test("two people can put the same tag on one entry", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const entry = await makeEntry(db, await makeFeed(db, "https://a.example/f"), { title: "E" });
    await setEntryTags(db, alice, entry, ["oer"]);
    await setEntryTags(db, bobby, entry, ["OER", "oer"]);
    const rows = await db.selectFrom("entry_tags").select("user_id").where("entry_id", "=", entry).execute();
    expect(rows.map((r) => r.user_id).sort()).toEqual([alice, bobby].sort());
    expect(await db.selectFrom("tags").selectAll().where("name", "=", "oer").execute()).toHaveLength(1);
  }));

test("replacing my tags leaves other people's and the feed's own tags alone", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const entry = await makeEntry(db, await makeFeed(db, "https://a.example/f"), { title: "E", tags: ["source"] });
    await setEntryTags(db, bobby, entry, ["bob"]);
    await setEntryTags(db, alice, entry, ["one", "two"]);
    await setEntryTags(db, alice, entry, ["two", "three"]);
    expect(await getMyEntryTags(db, alice, entry)).toEqual(["three", "two"]);
    expect(await getMyEntryTags(db, bobby, entry)).toEqual(["bob"]);
    const source = await db.selectFrom("entry_tags").selectAll().where("entry_id", "=", entry).where("user_id", "is", null).execute();
    expect(source).toHaveLength(1);
    await setEntryTags(db, alice, entry, []);
    expect(await getMyEntryTags(db, alice, entry)).toEqual([]);
  }));

test("tagging an entry that does not exist is refused", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    await expect(setEntryTags(db, alice, 999_999, ["x"])).rejects.toBeInstanceOf(NotFoundError);
  }));

test("suggestions: popular counts each person once per tag; mine are my most used", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const feed = await makeFeed(db, "https://a.example/f");
    const entry = await makeEntry(db, feed, { title: "E", tags: ["oer"] });
    const another = await makeEntry(db, feed, { title: "F" });
    await setEntryTags(db, alice, entry, ["oer", "reading"]);
    await setEntryTags(db, bobby, entry, ["oer", "bobs"]);
    await setEntryTags(db, alice, another, ["reading", "later"]);
    const s = await suggestTags(db, alice, entry);
    expect(s.popular[0]).toBe("oer"); // feed + alice + bobby
    expect(s.popular).toEqual(expect.arrayContaining(["oer", "reading", "bobs"]));
    expect(s.mine[0]).toBe("reading"); // used twice by alice
    expect(s.mine).not.toContain("bobs");
    expect((await suggestTags(db, alice, entry, 1)).popular).toEqual(["oer"]);
  }));
