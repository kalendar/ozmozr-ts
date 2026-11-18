import { sql, type RawBuilder } from "kysely";
import type { Db } from "@/db/client";
import { entryTagNames, PAGE_SIZE, type EntryListItem } from "@/domain/entries/query";

export { setSubscriptionTags } from "@/domain/feeds/repo";

export type NewsItem = EntryListItem & { read: boolean; myTags: string[] };
export type NewsCursor = { publishedAt: Date; id: number };

/**
 * One tag matches an entry in a person's news when the entry carries it (from
 * the feed or from that person) or their subscription to its feed carries it.
 */
function newsTagMatch(userId: string, tag: string): RawBuilder<boolean> {
  return sql<boolean>`(
    exists (
      select 1 from entry_tags et join tags t on t.id = et.tag_id
      where et.entry_id = entries.id and t.name = ${tag} and (et.user_id is null or et.user_id = ${userId})
    ) or exists (
      select 1 from subscription_tags st join tags t on t.id = st.tag_id
      where st.subscription_id = s.id and t.name = ${tag}
    )
  )`;
}

/** Entries from the person's subscriptions, with their read state joined in. */
function newsBase(db: Db, userId: string, tags: readonly string[] | undefined) {
  let q = db
    .selectFrom("entries")
    .innerJoin("feeds", "feeds.id", "entries.feed_id")
    .innerJoin("subscriptions as s", (join) => join.onRef("s.feed_id", "=", "entries.feed_id").on("s.user_id", "=", userId))
    .leftJoin("entry_reads as er", (join) => join.onRef("er.entry_id", "=", "entries.id").on("er.user_id", "=", userId));
  for (const tag of tags ?? []) q = q.where(newsTagMatch(userId, tag));
  return q;
}

export async function listNews(
  db: Db,
  userId: string,
  opts: { tags?: string[]; unreadOnly?: boolean; before?: NewsCursor; limit?: number },
): Promise<NewsItem[]> {
  let q = newsBase(db, userId, opts.tags).select([
    "entries.id",
    "entries.feed_id as feedId",
    sql<string>`coalesce(nullif(s.title, ''), feeds.title)`.as("feedTitle"),
    "entries.url",
    "entries.title",
    "entries.summary",
    "entries.published_at as publishedAt",
    entryTagNames.as("tags"),
    sql<boolean>`er.entry_id is not null`.as("read"),
    sql<string[]>`coalesce((
      select array_agg(t.name order by t.name) from entry_tags et join tags t on t.id = et.tag_id
      where et.entry_id = entries.id and et.user_id = ${userId}
    ), '{}')`.as("myTags"),
  ]);
  if (opts.unreadOnly) q = q.where("er.entry_id", "is", null);
  if (opts.before) {
    q = q.where(sql<boolean>`(entries.published_at, entries.id) < (${opts.before.publishedAt}, ${opts.before.id})`);
  }
  return q
    .orderBy("entries.published_at", "desc")
    .orderBy("entries.id", "desc")
    .limit(opts.limit ?? PAGE_SIZE)
    .execute();
}

/** Marks entries read. Ids that do not exist are ignored. */
export async function markRead(db: Db, userId: string, entryIds: readonly number[]): Promise<void> {
  const ids = [...new Set(entryIds)];
  if (ids.length === 0) return;
  await db
    .insertInto("entry_reads")
    .columns(["user_id", "entry_id"])
    .expression(db.selectFrom("entries").select([sql<string>`${userId}`.as("user_id"), "id"]).where("id", "in", ids))
    .onConflict((oc) => oc.doNothing())
    .execute();
}

/** Marks everything unread in the person's news (optionally only what matches the tags) as read. */
export async function markAllRead(db: Db, userId: string, tags?: string[]): Promise<number> {
  const result = await db
    .insertInto("entry_reads")
    .columns(["user_id", "entry_id"])
    .expression(
      newsBase(db, userId, tags)
        .select([sql<string>`${userId}`.as("user_id"), "entries.id"])
        .where("er.entry_id", "is", null),
    )
    .onConflict((oc) => oc.doNothing())
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0);
}

/** The most-used tags across a person's news: entry tags (the feed's and their own) and subscription tags. */
export async function newsTagCloud(db: Db, userId: string, limit = 50): Promise<{ name: string; count: number }[]> {
  const result = await sql<{ name: string; count: number }>`
    select name, count from (
      select t.name, count(*) as count from (
        select et.tag_id from entry_tags et
        join entries e on e.id = et.entry_id
        join subscriptions s on s.feed_id = e.feed_id and s.user_id = ${userId}
        where et.user_id is null or et.user_id = ${userId}
        union all
        select st.tag_id from subscription_tags st
        join subscriptions s on s.id = st.subscription_id and s.user_id = ${userId}
      ) used
      join tags t on t.id = used.tag_id
      group by t.name
      order by count(*) desc, t.name
      limit ${limit}
    ) top
    order by name
  `.execute(db);
  return result.rows;
}
