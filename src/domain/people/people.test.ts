import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { setEntryTags } from "@/domain/tags/repo";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
  addProfileComment, deleteProfileComment, getProfileByUserId, listPeople, listProfileComments, updateProfile, userTagCloud,
} from "./profiles";

const valid = { displayName: "Alice A", blurb: "Hello", location: "Logan, UT", website: "https://alice.example/" };

test("updates a profile", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    await updateProfile(db, alice, valid);
    expect(await getProfileByUserId(db, alice)).toMatchObject({
      display_name: "Alice A", blurb: "Hello", location: "Logan, UT", website: "https://alice.example/",
    });
    await updateProfile(db, alice, { ...valid, website: "" });
    expect((await getProfileByUserId(db, alice))?.website).toBe("");
  }));

test("rejects unsafe websites, long blurbs and empty names", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    for (const bad of [
      { ...valid, website: "javascript:alert(1)" },
      { ...valid, website: "ftp://x.example" },
      { ...valid, website: "not a url" },
      { ...valid, blurb: "x".repeat(2001) },
      { ...valid, displayName: "   " },
      { ...valid, location: "x".repeat(101) },
    ]) {
      await expect(updateProfile(db, alice, bad)).rejects.toBeInstanceOf(ValidationError);
    }
  }));

test("lists people by newest or name, optionally by the tags they use", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    await makeUser(db, "carol");
    const entry = await makeEntry(db, await makeFeed(db, "https://a.example/f"), { title: "E" });
    await setEntryTags(db, alice, entry, ["oer", "rss"]);
    await setEntryTags(db, bobby, entry, ["oer"]);
    expect((await listPeople(db, { sort: "alpha", page: 1 })).map((p) => p.handle)).toEqual(["alice", "bobby", "carol"]);
    expect((await listPeople(db, { sort: "new", page: 1 })).map((p) => p.handle)).toEqual(["carol", "bobby", "alice"]);
    expect((await listPeople(db, { sort: "alpha", tags: ["oer"], page: 1 })).map((p) => p.handle)).toEqual(["alice", "bobby"]);
    expect((await listPeople(db, { sort: "alpha", tags: ["oer", "rss"], page: 1 })).map((p) => p.handle)).toEqual(["alice"]);
    expect(await userTagCloud(db, alice)).toEqual([{ name: "oer", count: 1 }, { name: "rss", count: 1 }]);
  }));

test("profile comments are plain text of 1 to 2000 characters, newest first", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    await addProfileComment(db, bobby, alice, "  <b>Hi</b> Alice  ");
    await expect(addProfileComment(db, bobby, alice, "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(addProfileComment(db, bobby, alice, "x".repeat(2001))).rejects.toBeInstanceOf(ValidationError);
    const comments = await listProfileComments(db, alice);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ body: "<b>Hi</b> Alice", author: { handle: "bobby" } });
  }));

test("a comment can be deleted by its author or the profile owner, nobody else", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const carol = await makeUser(db, "carol");
    await addProfileComment(db, bobby, alice, "one");
    await addProfileComment(db, bobby, alice, "two");
    const [second, first] = await listProfileComments(db, alice);
    await expect(deleteProfileComment(db, carol, first!.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteProfileComment(db, bobby, first!.id);
    await deleteProfileComment(db, alice, second!.id);
    expect(await listProfileComments(db, alice)).toEqual([]);
  }));
