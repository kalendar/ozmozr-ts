import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
  friendStatus, getFriendTags, listFriends, listPendingRequests, removeFriend, requestFriend, respondToRequest, setFriendTags,
} from "./friends";
import { listSharedWithMe, shareEntryWithFriends } from "./shares";

test("a request is pending-out for the sender and pending-in for the recipient", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    expect(await friendStatus(db, alice, bobby)).toBe("none");
    expect(await requestFriend(db, alice, bobby)).toBe("requested");
    expect(await requestFriend(db, alice, bobby)).toBe("exists");
    expect(await friendStatus(db, alice, bobby)).toBe("pending-out");
    expect(await friendStatus(db, bobby, alice)).toBe("pending-in");
    expect((await listPendingRequests(db, bobby)).map((p) => p.handle)).toEqual(["alice"]);
    expect(await listPendingRequests(db, alice)).toEqual([]);
    expect(await listFriends(db, alice)).toEqual([]);
  }));

test("you cannot befriend yourself or someone who does not exist", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    await expect(requestFriend(db, alice, alice)).rejects.toBeInstanceOf(ValidationError);
    await expect(requestFriend(db, alice, "u_nobody")).rejects.toBeInstanceOf(ValidationError);
  }));

test("requests in both directions become one friendship", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    await requestFriend(db, alice, bobby);
    expect(await requestFriend(db, bobby, alice)).toBe("accepted");
    expect(await friendStatus(db, alice, bobby)).toBe("friends");
    expect(await friendStatus(db, bobby, alice)).toBe("friends");
    expect(await db.selectFrom("friendships").selectAll().execute()).toHaveLength(1);
    expect((await listFriends(db, alice)).map((p) => p.handle)).toEqual(["bobby"]);
    expect((await listFriends(db, bobby)).map((p) => p.handle)).toEqual(["alice"]);
  }));

test("only the recipient can accept; declining removes the request", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const carol = await makeUser(db, "carol");
    await requestFriend(db, alice, bobby);
    await respondToRequest(db, alice, bobby, true); // the sender "accepting" does nothing
    await respondToRequest(db, carol, alice, true); // a stranger does nothing
    expect(await friendStatus(db, alice, bobby)).toBe("pending-out");
    await respondToRequest(db, bobby, alice, true);
    expect(await friendStatus(db, alice, bobby)).toBe("friends");

    await requestFriend(db, carol, alice);
    await respondToRequest(db, alice, carol, false);
    expect(await friendStatus(db, carol, alice)).toBe("none");
    await removeFriend(db, bobby, alice);
    expect(await friendStatus(db, alice, bobby)).toBe("none");
  }));

test("each side tags the other independently, and friends can be filtered by tag", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const carol = await makeUser(db, "carol");
    await requestFriend(db, alice, bobby, ["work", "oer"]);
    await respondToRequest(db, bobby, alice, true);
    await requestFriend(db, carol, alice);
    await respondToRequest(db, alice, carol, true);
    await setFriendTags(db, bobby, alice, ["family"]);
    await setFriendTags(db, alice, carol, ["work"]);
    expect(await getFriendTags(db, alice, bobby)).toEqual(["oer", "work"]);
    expect(await getFriendTags(db, bobby, alice)).toEqual(["family"]);
    expect((await listFriends(db, alice, { tags: ["work"] })).map((p) => p.handle)).toEqual(["bobby", "carol"]);
    expect((await listFriends(db, alice, { tags: ["work", "oer"] })).map((p) => p.handle)).toEqual(["bobby"]);
    expect(await listFriends(db, alice, { tags: ["family"] })).toEqual([]);
    await setFriendTags(db, alice, "u_nobody", ["x"]); // not a friend: ignored
  }));

test("sharing goes only to accepted friends, once per friend", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const carol = await makeUser(db, "carol");
    const entry = await makeEntry(db, await makeFeed(db, "https://a.example/f", "A"), { title: "Read this" });
    await requestFriend(db, alice, bobby);
    await respondToRequest(db, bobby, alice, true);
    await requestFriend(db, alice, carol); // still pending

    await expect(shareEntryWithFriends(db, alice, entry, [bobby, carol], "hi")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.selectFrom("entry_shares").selectAll().execute()).toEqual([]);

    await shareEntryWithFriends(db, alice, entry, [bobby], "first note");
    await shareEntryWithFriends(db, alice, entry, [bobby, bobby], "second note");
    const shared = await listSharedWithMe(db, bobby, { page: 1 });
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ title: "Read this", comment: "second note", sharedBy: { handle: "alice" } });
    expect(await listSharedWithMe(db, alice, { page: 1 })).toEqual([]);
    await expect(shareEntryWithFriends(db, alice, 999_999, [bobby])).rejects.toThrow();
  }));
