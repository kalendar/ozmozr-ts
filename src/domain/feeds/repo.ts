import { sql } from "kysely";
import type { Db } from "@/db/client";
import { entryHasAllTags, entryListQuery, PAGE_SIZE, pageOffset, type EntryListItem } from "@/domain/entries/query";
import { ensureTags } from "@/domain/tags/repo";
import { ValidationError } from "@/lib/errors";
import type { SafeFetchOptions } from "@/lib/safe-fetch";
import { normalizeTags } from "@/lib/tags";
import { discoverFeed } from "./discover";

export type FeedListItem = {
  id: number;
  title: string;
  url: string;
  siteUrl: string | null;
  description: string;
  subscriberCount: number;
  subscribed: boolean;
  createdAt: Date;
  lastError: string | null;
};

export type FeedSort = "popular" | "new" | "alpha";

function feedListQuery(db: Db, userId: string | undefined) {
  return db
    .selectFrom("feeds")
    .leftJoin("subscriptions as s", "s.feed_id", "feeds.id")
    .where("feeds.kind", "=", "rss")
    .groupBy("feeds.id")
    .select([
      "feeds.id",
      "feeds.title",
      "feeds.url",
      "feeds.site_url as siteUrl",
      "feeds.description",
      "feeds.created_at as createdAt",
      "feeds.last_error as lastError",
      sql<number>`count(s.id)`.as("subscriberCount"),
      sql<boolean>`coalesce(bool_or(s.user_id = ${userId ?? null}), false)`.as("subscribed"),
    ]);
}

/** The public feed directory. `tags` keeps feeds whose subscribers gave them every tag. */
export async function listFeeds(
  db: Db,
  opts: { userId?: string; sort: FeedSort; tags?: string[]; page: number },
): Promise<FeedListItem[]> {
  let q = feedListQuery(db, opts.userId);
  if (opts.tags && opts.tags.length > 0) {
    q = q.where(
      sql<boolean>`feeds.id in (
        select s2.feed_id from subscriptions s2
        join subscription_tags st on st.subscription_id = s2.id
        join tags t on t.id = st.tag_id
        where t.name in (${sql.join(opts.tags)})
        group by s2.feed_id
        having count(distinct t.name) = ${opts.tags.length}
      )`,
    );
  }
  if (opts.sort === "popular") q = q.orderBy(sql`count(s.id)`, "desc").orderBy(sql`lower(feeds.title)`).orderBy("feeds.id");
  else if (opts.sort === "new") q = q.orderBy("feeds.created_at", "desc").orderBy("feeds.id", "desc");
  else q = q.orderBy(sql`lower(feeds.title)`).orderBy("feeds.id");
  return q.limit(PAGE_SIZE).offset(pageOffset(opts.page)).execute();
}

export async function getFeed(db: Db, feedId: number, userId?: string): Promise<FeedListItem | null> {
  const row = await feedListQuery(db, userId).where("feeds.id", "=", feedId).executeTakeFirst();
  return row ?? null;
}

export async function listFeedEntries(
  db: Db,
  feedId: number,
  opts: { tags?: string[]; page: number },
): Promise<EntryListItem[]> {
  let q = entryListQuery(db).where("entries.feed_id", "=", feedId);
  if (opts.tags && opts.tags.length > 0) q = q.where(entryHasAllTags(opts.tags));
  return q
    .orderBy("entries.published_at", "desc")
    .orderBy("entries.id", "desc")
    .limit(PAGE_SIZE)
    .offset(pageOffset(opts.page))
    .execute();
}

/** Replaces the tags a person has put on one of their subscriptions. Does nothing if they are not subscribed. */
export async function setSubscriptionTags(db: Db, userId: string, feedId: number, tags: string[]): Promise<void> {
  const subscription = await db
    .selectFrom("subscriptions")
    .select("id")
    .where("user_id", "=", userId)
    .where("feed_id", "=", feedId)
    .executeTakeFirst();
  if (!subscription) return;
  const names = normalizeTags(tags);
  const ids = await ensureTags(db, names);
  await db.deleteFrom("subscription_tags").where("subscription_id", "=", subscription.id).execute();
  if (names.length > 0) {
    await db
      .insertInto("subscription_tags")
      .values(names.map((name) => ({ subscription_id: subscription.id, tag_id: ids.get(name)! })))
      .execute();
  }
}

export async function getSubscription(
  db: Db,
  userId: string,
  feedId: number,
): Promise<{ title: string; tags: string[] } | null> {
  const row = await db
    .selectFrom("subscriptions as s")
    .select([
      "s.title",
      sql<string[]>`coalesce((
        select array_agg(t.name order by t.name) from subscription_tags st
        join tags t on t.id = st.tag_id where st.subscription_id = s.id
      ), '{}')`.as("tags"),
    ])
    .where("s.user_id", "=", userId)
    .where("s.feed_id", "=", feedId)
    .executeTakeFirst();
  return row ?? null;
}

/** Subscribes without any network access; the feed row is created if needed. */
export async function subscribeToFeedUrl(
  db: Db,
  userId: string,
  input: { feedUrl: string; feedTitle?: string; title?: string; tags: string[] },
): Promise<{ feedId: number; created: boolean }> {
  if (input.feedUrl.length > 2000) throw new ValidationError("That address is too long");
  const inserted = await db
    .insertInto("feeds")
    .values({ url: input.feedUrl, title: (input.feedTitle ?? "").slice(0, 300) })
    .onConflict((oc) => oc.column("url").doNothing())
    .returning("id")
    .executeTakeFirst();
  const feedId =
    inserted?.id ??
    (await db.selectFrom("feeds").select("id").where("url", "=", input.feedUrl).executeTakeFirstOrThrow()).id;
  const title = (input.title ?? "").trim().slice(0, 300);
  await db
    .insertInto("subscriptions")
    .values({ user_id: userId, feed_id: feedId, title })
    .onConflict((oc) => oc.columns(["user_id", "feed_id"]).doUpdateSet({ title }))
    .execute();
  await setSubscriptionTags(db, userId, feedId, input.tags);
  return { feedId, created: Boolean(inserted) };
}

/**
 * Subscribes a person to whatever feed lives at (or is advertised by) a pasted
 * address. Throws UnsafeUrlError or FeedNotFoundError.
 */
export async function subscribeToUrl(
  db: Db,
  userId: string,
  input: { url: string; title?: string; tags: string[] },
  fetchOpts: SafeFetchOptions = {},
): Promise<{ feedId: number; created: boolean }> {
  const found = await discoverFeed(input.url, fetchOpts);
  return subscribeToFeedUrl(db, userId, {
    feedUrl: found.url,
    feedTitle: found.parsed?.title,
    title: input.title,
    tags: input.tags,
  });
}

/** Subscribes to a feed that already exists in the directory. */
export async function subscribeToFeed(db: Db, userId: string, feedId: number): Promise<void> {
  const feed = await db.selectFrom("feeds").select("id").where("id", "=", feedId).where("kind", "=", "rss").executeTakeFirst();
  if (!feed) return;
  await db
    .insertInto("subscriptions")
    .values({ user_id: userId, feed_id: feedId })
    .onConflict((oc) => oc.columns(["user_id", "feed_id"]).doNothing())
    .execute();
}

export async function unsubscribe(db: Db, userId: string, feedId: number): Promise<void> {
  await db
    .deleteFrom("subscriptions")
    .where("user_id", "=", userId)
    .where("feed_id", "=", feedId)
    .where("feed_id", "in", db.selectFrom("feeds").select("id").where("kind", "=", "rss"))
    .execute();
}

/** Ids of rss feeds whose refresh time has passed, most overdue first. */
export async function dueFeedIds(db: Db, now: Date, limit: number): Promise<number[]> {
  const rows = await db
    .selectFrom("feeds")
    .select("id")
    .where("kind", "=", "rss")
    .where("next_refresh_at", "<=", now)
    .orderBy("next_refresh_at")
    .orderBy("id")
    .limit(limit)
    .execute();
  return rows.map((r) => r.id);
}

/** Marks a feed as due now; the worker's next sweep (within a minute) harvests it. */
export async function enqueueHarvest(db: Db, feedId: number, now: Date = new Date()): Promise<void> {
  await db.updateTable("feeds").set({ next_refresh_at: now }).where("id", "=", feedId).execute();
}
