import { expect, test } from "vitest";
import type { Db } from "@/db/client";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { search } from "@/domain/search/repo";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { addGroupComment, listGroupComments } from "./comments";
import {
  addGroupFeed, getGroupEntry, listGroupEntries, listGroupFeedEntries, listGroupFeeds, removeGroupEntry, removeGroupFeed, shareEntryWithGroup,
} from "./entries";
import { addGroupLink, listGroupLinks, removeGroupLink, reorderGroupLinks } from "./links";
import {
  createGroup, deleteGroup, getGroupBySlug, joinGroup, leaveGroup, listGroups, listGroupsForUser, listMembers, requireRole, updateGroup,
} from "./repo";
import { vote } from "./votes";

const input = { title: "Open Ed", slug: "open-ed", description: "People who care about open education" };
const now = new Date("2026-11-17T12:00:00Z");

async function world(db: Db) {
  const owner = await makeUser(db, "owner");
  const member = await makeUser(db, "member");
  const outsider = await makeUser(db, "outsider");
  const group = await createGroup(db, owner, input);
  await joinGroup(db, member, group.id);
  const feed = await makeFeed(db, "https://blog.example/feed", "Blog");
  const e1 = await makeEntry(db, feed, { title: "One", publishedAt: "2026-11-10T00:00:00Z", tags: ["oer"] });
  const e2 = await makeEntry(db, feed, { title: "Two", publishedAt: "2026-11-11T00:00:00Z" });
  return { owner, member, outsider, group, feed, e1, e2 };
}

test("the creator becomes the owner", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    const found = await getGroupBySlug(db, "open-ed", w.owner);
    expect(found).toMatchObject({ title: "Open Ed", role: "owner", memberCount: 2 });
    expect((await getGroupBySlug(db, "OPEN-ED", w.member))?.role).toBe("member");
    expect((await getGroupBySlug(db, "open-ed", w.outsider))?.role).toBeNull();
    expect((await getGroupBySlug(db, "open-ed"))?.role).toBeNull();
    expect(await getGroupBySlug(db, "nope")).toBeNull();
    expect((await listMembers(db, w.group.id)).map((m) => [m.handle, m.role])).toEqual([["owner", "owner"], ["member", "member"]]);
  }));

test("rejects bad slugs, duplicate slugs and titles that differ only by case", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    for (const slug of ["ab", "Has Space", "UPPER", "x".repeat(41), "new", "under_score"]) {
      await expect(createGroup(db, w.owner, { ...input, title: `T ${slug}`, slug })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(createGroup(db, w.member, { ...input, title: "Different" })).rejects.toThrow(/address/);
    await expect(createGroup(db, w.member, { ...input, slug: "other", title: "OPEN ED" })).rejects.toThrow(/name/);
    await expect(createGroup(db, w.member, { ...input, slug: "other", title: " " })).rejects.toBeInstanceOf(ValidationError);
  }));

test("only the owner can change or delete a group", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    const change = { title: "Renamed", description: "New words" };
    await expect(updateGroup(db, w.member, w.group.id, change)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateGroup(db, w.outsider, w.group.id, change)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteGroup(db, w.member, w.group.id)).rejects.toBeInstanceOf(ForbiddenError);
    await updateGroup(db, w.owner, w.group.id, change);
    expect((await getGroupBySlug(db, "open-ed"))?.title).toBe("Renamed");
    await deleteGroup(db, w.owner, w.group.id);
    expect(await getGroupBySlug(db, "open-ed")).toBeNull();
  }));

test("joining twice keeps one membership; members can leave but the owner cannot", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    await joinGroup(db, w.member, w.group.id);
    expect((await getGroupBySlug(db, "open-ed"))?.memberCount).toBe(2);
    await expect(leaveGroup(db, w.owner, w.group.id)).rejects.toBeInstanceOf(ValidationError);
    await leaveGroup(db, w.member, w.group.id);
    expect((await getGroupBySlug(db, "open-ed", w.member))?.role).toBeNull();
    await expect(requireRole(db, w.member, w.group.id, "member")).rejects.toBeInstanceOf(ForbiddenError);
    await requireRole(db, w.owner, w.group.id, "member"); // an owner is also a member
  }));

test("lists groups by popularity, newest and name; mine only; and finds them by search", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    const small = await createGroup(db, w.outsider, { title: "Astronomy", slug: "astro", description: "Stars" });
    expect((await listGroups(db, { sort: "popular", page: 1 })).map((g) => g.slug)).toEqual(["open-ed", "astro"]);
    expect((await listGroups(db, { sort: "alpha", page: 1 })).map((g) => g.slug)).toEqual(["astro", "open-ed"]);
    expect((await listGroups(db, { sort: "new", page: 1 })).map((g) => g.id)).toEqual([small.id, w.group.id]);
    expect((await listGroups(db, { sort: "alpha", userId: w.member, mine: true, page: 1 })).map((g) => g.slug)).toEqual(["open-ed"]);
    expect((await listGroupsForUser(db, w.outsider)).map((g) => g.slug)).toEqual(["astro"]);
    const found = await search(db, "open education", { type: "groups", page: 1 });
    expect(found.items.map((g) => g.slug)).toEqual(["open-ed"]);
  }));

test("only the owner manages the group's feeds; their entries form a river", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    await expect(addGroupFeed(db, w.member, w.group.id, w.feed)).rejects.toBeInstanceOf(ForbiddenError);
    await addGroupFeed(db, w.owner, w.group.id, w.feed);
    await addGroupFeed(db, w.owner, w.group.id, w.feed);
    expect((await listGroupFeeds(db, w.group.id)).map((f) => f.title)).toEqual(["Blog"]);
    expect((await listGroupFeedEntries(db, w.group.id, { page: 1 })).map((e) => e.title)).toEqual(["Two", "One"]);
    await expect(removeGroupFeed(db, w.member, w.group.id, w.feed)).rejects.toBeInstanceOf(ForbiddenError);
    await removeGroupFeed(db, w.owner, w.group.id, w.feed);
    expect(await listGroupFeedEntries(db, w.group.id, { page: 1 })).toEqual([]);
  }));

test("members share entries; sharing the same entry again returns the same row", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    await expect(shareEntryWithGroup(db, w.outsider, w.group.id, w.e1)).rejects.toBeInstanceOf(ForbiddenError);
    const first = await shareEntryWithGroup(db, w.member, w.group.id, w.e1, "Look at this");
    const again = await shareEntryWithGroup(db, w.owner, w.group.id, w.e1, "Me too");
    expect(again).toBe(first);
    const items = await listGroupEntries(db, w.group.id, { userId: w.member, sort: "latest", page: 1, now });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      groupEntryId: first, title: "One", comment: "Look at this", score: 0, myVote: 0, commentCount: 0,
      sharedBy: { handle: "member" }, tags: ["oer"],
    });
    expect((await getGroupEntry(db, w.group.id, first, w.member))?.title).toBe("One");
    expect(await getGroupEntry(db, w.group.id + 1, first)).toBeNull();
  }));

test("votes: same vote twice removes it, the opposite replaces it, and only members vote", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    const ge = await shareEntryWithGroup(db, w.member, w.group.id, w.e1);
    expect(await vote(db, w.member, ge, 1)).toEqual({ score: 1, myVote: 1 });
    expect(await vote(db, w.member, ge, 1)).toEqual({ score: 0, myVote: 0 });
    expect(await vote(db, w.member, ge, 1)).toEqual({ score: 1, myVote: 1 });
    expect(await vote(db, w.member, ge, -1)).toEqual({ score: -1, myVote: -1 });
    expect(await vote(db, w.owner, ge, 1)).toEqual({ score: 0, myVote: 1 });
    await expect(vote(db, w.outsider, ge, 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(vote(db, w.member, 999_999, 1)).rejects.toThrow();
  }));

test("popular orders by score and ignores entries shared more than 30 days ago", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    const old = await makeEntry(db, w.feed, { title: "Ancient" });
    const g1 = await shareEntryWithGroup(db, w.member, w.group.id, w.e1);
    const g2 = await shareEntryWithGroup(db, w.member, w.group.id, w.e2);
    const g3 = await shareEntryWithGroup(db, w.member, w.group.id, old);
    await db.updateTable("group_entries").set({ created_at: "2026-11-16T00:00:00Z" }).where("id", "=", g1).execute();
    await db.updateTable("group_entries").set({ created_at: "2026-11-15T00:00:00Z" }).where("id", "=", g2).execute();
    await db.updateTable("group_entries").set({ created_at: "2026-10-17T00:00:00Z" }).where("id", "=", g3).execute(); // 31 days
    await vote(db, w.member, g2, 1);
    await vote(db, w.owner, g2, 1);
    await vote(db, w.owner, g3, 1);
    await vote(db, w.member, g1, -1);
    const popular = await listGroupEntries(db, w.group.id, { userId: w.owner, sort: "popular", page: 1, now });
    expect(popular.map((e) => [e.title, e.score, e.myVote])).toEqual([["Two", 2, 1], ["One", -1, 0]]);
    const latest = await listGroupEntries(db, w.group.id, { sort: "latest", page: 1, now });
    expect(latest.map((e) => e.title)).toEqual(["One", "Two", "Ancient"]);
    const tagged = await listGroupEntries(db, w.group.id, { sort: "latest", tags: ["oer"], page: 1, now });
    expect(tagged.map((e) => e.title)).toEqual(["One"]);
  }));

test("a shared entry can be removed by the owner or the person who shared it", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    const other = await makeUser(db, "other");
    await joinGroup(db, other, w.group.id);
    const ge = await shareEntryWithGroup(db, w.member, w.group.id, w.e1);
    await expect(removeGroupEntry(db, other, ge)).rejects.toBeInstanceOf(ForbiddenError);
    await removeGroupEntry(db, w.member, ge);
    const ge2 = await shareEntryWithGroup(db, w.member, w.group.id, w.e1);
    await removeGroupEntry(db, w.owner, ge2);
    expect(await listGroupEntries(db, w.group.id, { sort: "latest", page: 1, now })).toEqual([]);
  }));

test("comments nest under their parent; only members comment; parents must match", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    const ge = await shareEntryWithGroup(db, w.member, w.group.id, w.e1);
    const otherGe = await shareEntryWithGroup(db, w.member, w.group.id, w.e2);
    const top = await addGroupComment(db, w.member, ge, "First!");
    const reply = await addGroupComment(db, w.owner, ge, "Welcome", top);
    await addGroupComment(db, w.member, ge, "Deeper", reply);
    await addGroupComment(db, w.owner, ge, "Second thread");
    await expect(addGroupComment(db, w.outsider, ge, "Hi")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addGroupComment(db, w.member, otherGe, "Wrong parent", top)).rejects.toBeInstanceOf(ValidationError);
    await expect(addGroupComment(db, w.member, ge, "  ")).rejects.toBeInstanceOf(ValidationError);
    const tree = await listGroupComments(db, ge);
    expect(tree.map((c) => c.body)).toEqual(["First!", "Second thread"]);
    expect(tree[0]!.replies.map((c) => c.body)).toEqual(["Welcome"]);
    expect(tree[0]!.replies[0]!.replies.map((c) => c.body)).toEqual(["Deeper"]);
    expect(tree[0]!.author.handle).toBe("member");
    const [item] = await listGroupEntries(db, w.group.id, { sort: "latest", tags: ["oer"], page: 1, now });
    expect(item!.commentCount).toBe(4);
  }));

test("pinned links: owner only, ordered, and reordering ignores other groups' links", () =>
  withTestDb(async (db) => {
    const w = await world(db);
    const other = await createGroup(db, w.outsider, { title: "Other", slug: "other", description: "x" });
    await expect(addGroupLink(db, w.member, w.group.id, { url: "https://x.example/", title: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addGroupLink(db, w.owner, w.group.id, { url: "javascript:alert(1)", title: "X" })).rejects.toBeInstanceOf(ValidationError);
    const faq = await addGroupLink(db, w.owner, w.group.id, { url: "https://x.example/faq", title: "FAQ" });
    const forum = await addGroupLink(db, w.owner, w.group.id, { url: "https://x.example/forum", title: "Forum" });
    const foreign = await addGroupLink(db, w.outsider, other.id, { url: "https://y.example/", title: "Theirs" });
    expect((await listGroupLinks(db, w.group.id)).map((l) => l.title)).toEqual(["FAQ", "Forum"]);
    await reorderGroupLinks(db, w.owner, w.group.id, [forum, faq]);
    expect((await listGroupLinks(db, w.group.id)).map((l) => l.title)).toEqual(["Forum", "FAQ"]);
    await reorderGroupLinks(db, w.owner, w.group.id, [foreign, faq, forum]);
    expect((await listGroupLinks(db, w.group.id)).map((l) => l.title)).toEqual(["Forum", "FAQ"]);
    expect((await listGroupLinks(db, other.id)).map((l) => l.title)).toEqual(["Theirs"]);
    await expect(removeGroupLink(db, w.member, w.group.id, faq)).rejects.toBeInstanceOf(ForbiddenError);
    await removeGroupLink(db, w.owner, w.group.id, faq);
    await removeGroupLink(db, w.owner, w.group.id, foreign); // not this group's: ignored
    expect((await listGroupLinks(db, w.group.id)).map((l) => l.title)).toEqual(["Forum"]);
    expect(await listGroupLinks(db, other.id)).toHaveLength(1);
  }));
