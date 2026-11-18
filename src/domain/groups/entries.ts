import { sql } from "kysely";
import type { Db } from "@/db/client";
import { entryHasAllTags, entryListQuery, PAGE_SIZE, pageOffset, type EntryListItem } from "@/domain/entries/query";
import type { PersonRef } from "@/domain/people/profiles";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { getRole, requireRole } from "./repo";

export type GroupEntryItem = EntryListItem & {
  groupEntryId: number;
  sharedBy: PersonRef;
  comment: string;
  sharedAt: Date;
  score: number;
  myVote: 1 | -1 | 0;
  commentCount: number;
};

export const POPULAR_WINDOW_DAYS = 30;

export async function addGroupFeed(db: Db, userId: string, groupId: number, feedId: number): Promise<void> {
  await requireRole(db, userId, groupId, "owner");
  const feed = await db.selectFrom("feeds").select("id").where("id", "=", feedId).where("kind", "=", "rss").executeTakeFirst();
  if (!feed) throw new NotFoundError("That feed does not exist");
  await db.insertInto("group_feeds").values({ group_id: groupId, feed_id: feedId }).onConflict((oc) => oc.doNothing()).execute();
}

export async function removeGroupFeed(db: Db, userId: string, groupId: number, feedId: number): Promise<void> {
  await requireRole(db, userId, groupId, "owner");
  await db.deleteFrom("group_feeds").where("group_id", "=", groupId).where("feed_id", "=", feedId).execute();
}

export async function listGroupFeeds(db: Db, groupId: number): Promise<{ id: number; title: string; url: string; description: string }[]> {
  return db
    .selectFrom("group_feeds as gf")
    .innerJoin("feeds", "feeds.id", "gf.feed_id")
    .select(["feeds.id", "feeds.title", "feeds.url", "feeds.description"])
    .where("gf.group_id", "=", groupId)
    .orderBy(sql`lower(feeds.title)`)
    .execute();
}

/** The river of entries from the feeds a group follows. */
export async function listGroupFeedEntries(db: Db, groupId: number, opts: { page: number }): Promise<EntryListItem[]> {
  return entryListQuery(db)
    .where("entries.feed_id", "in", db.selectFrom("group_feeds").select("feed_id").where("group_id", "=", groupId))
    .orderBy("entries.published_at", "desc")
    .orderBy("entries.id", "desc")
    .limit(PAGE_SIZE)
    .offset(pageOffset(opts.page))
    .execute();
}

/**
 * Puts an entry in front of a group. Members only. If the entry is already
 * there, the existing share is returned unchanged.
 */
export async function shareEntryWithGroup(db: Db, userId: string, groupId: number, entryId: number, comment = ""): Promise<number> {
  await requireRole(db, userId, groupId, "member");
  const entry = await db.selectFrom("entries").select("id").where("id", "=", entryId).executeTakeFirst();
  if (!entry) throw new NotFoundError("That entry no longer exists");
  const inserted = await db
    .insertInto("group_entries")
    .values({ group_id: groupId, entry_id: entryId, shared_by: userId, comment: comment.trim().slice(0, 2000) })
    .onConflict((oc) => oc.columns(["group_id", "entry_id"]).doNothing())
    .returning("id")
    .executeTakeFirst();
  if (inserted) return inserted.id;
  return (
    await db
      .selectFrom("group_entries")
      .select("id")
      .where("group_id", "=", groupId)
      .where("entry_id", "=", entryId)
      .executeTakeFirstOrThrow()
  ).id;
}

/** Removes a shared entry from a group: allowed for the group's owner and for whoever shared it. */
export async function removeGroupEntry(db: Db, userId: string, groupEntryId: number): Promise<void> {
  const row = await db.selectFrom("group_entries").select(["group_id", "shared_by"]).where("id", "=", groupEntryId).executeTakeFirst();
  if (!row) return;
  if (row.shared_by !== userId && (await getRole(db, userId, row.group_id)) !== "owner") throw new ForbiddenError();
  await db.deleteFrom("group_entries").where("id", "=", groupEntryId).execute();
}

const score = sql<number>`coalesce((select sum(v.value) from group_entry_votes v where v.group_entry_id = ge.id), 0)::int`;

function groupEntryQuery(db: Db, groupId: number, userId: string | undefined) {
  return entryListQuery(db)
    .innerJoin("group_entries as ge", "ge.entry_id", "entries.id")
    .innerJoin("profiles as p", "p.user_id", "ge.shared_by")
    .where("ge.group_id", "=", groupId)
    .select([
      "ge.id as groupEntryId",
      "ge.comment",
      "ge.created_at as sharedAt",
      "p.user_id as sharerId",
      "p.handle as sharerHandle",
      "p.display_name as sharerName",
      "p.avatar_path as sharerAvatar",
      score.as("score"),
      sql<1 | -1 | 0>`coalesce((
        select v.value from group_entry_votes v where v.group_entry_id = ge.id and v.user_id = ${userId ?? null}
      ), 0)::int`.as("myVote"),
      sql<number>`(select count(*) from group_entry_comments c where c.group_entry_id = ge.id)`.as("commentCount"),
    ]);
}

type Row = Awaited<ReturnType<ReturnType<typeof groupEntryQuery>["execute"]>>[number];

function toItem({ sharerId, sharerHandle, sharerName, sharerAvatar, ...rest }: Row): GroupEntryItem {
  return { ...rest, sharedBy: { userId: sharerId, handle: sharerHandle, displayName: sharerName, avatarPath: sharerAvatar } };
}

/**
 * Entries shared to a group. "latest" is newest share first; "popular" is
 * highest score first among entries shared in the last 30 days.
 */
export async function listGroupEntries(
  db: Db,
  groupId: number,
  opts: { userId?: string; sort: "latest" | "popular"; tags?: string[]; page: number; now?: Date },
): Promise<GroupEntryItem[]> {
  let q = groupEntryQuery(db, groupId, opts.userId);
  if (opts.tags && opts.tags.length > 0) q = q.where(entryHasAllTags(opts.tags));
  if (opts.sort === "popular") {
    const since = new Date((opts.now ?? new Date()).getTime() - POPULAR_WINDOW_DAYS * 86_400_000);
    q = q.where("ge.created_at", ">", since).orderBy(score, "desc");
  }
  const rows = await q
    .orderBy("ge.created_at", "desc")
    .orderBy("ge.id", "desc")
    .limit(PAGE_SIZE)
    .offset(pageOffset(opts.page))
    .execute();
  return rows.map(toItem);
}

export async function getGroupEntry(db: Db, groupId: number, groupEntryId: number, userId?: string): Promise<GroupEntryItem | null> {
  const row = await groupEntryQuery(db, groupId, userId).where("ge.id", "=", groupEntryId).executeTakeFirst();
  return row ? toItem(row) : null;
}

/** Which of a person's groups already hold an entry. */
export async function listGroupIdsHoldingEntry(db: Db, userId: string, entryId: number): Promise<number[]> {
  const rows = await db
    .selectFrom("group_entries as ge")
    .innerJoin("group_members as gm", (join) => join.onRef("gm.group_id", "=", "ge.group_id").on("gm.user_id", "=", userId))
    .select("ge.group_id")
    .where("ge.entry_id", "=", entryId)
    .execute();
  return rows.map((r) => r.group_id);
}

/** Tags on the entries shared to a group, with counts. */
export async function groupTagCloud(db: Db, groupId: number, limit = 40): Promise<{ name: string; count: number }[]> {
  const result = await sql<{ name: string; count: number }>`
    select name, count from (
      select t.name, count(distinct et.entry_id) as count
      from group_entries ge join entry_tags et on et.entry_id = ge.entry_id join tags t on t.id = et.tag_id
      where ge.group_id = ${groupId}
      group by t.name order by count(distinct et.entry_id) desc, t.name limit ${limit}
    ) top order by name
  `.execute(db);
  return result.rows;
}
