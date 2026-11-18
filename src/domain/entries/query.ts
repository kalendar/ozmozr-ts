import { sql, type RawBuilder } from "kysely";
import type { Db } from "@/db/client";

export const PAGE_SIZE = 20;

export type EntryListItem = {
  id: number;
  feedId: number;
  feedTitle: string;
  url: string | null;
  title: string;
  summary: string;
  publishedAt: Date;
  /** Every distinct tag on the entry, from the feed or from any person. */
  tags: string[];
};

export function pageOffset(page: number): number {
  return (Math.max(1, Math.floor(page) || 1) - 1) * PAGE_SIZE;
}

/** True when the entry carries every one of the tags, from the feed or from anyone. */
export function entryHasAllTags(tags: readonly string[]): RawBuilder<boolean> {
  return sql<boolean>`entries.id in (
    select et.entry_id from entry_tags et
    join tags t on t.id = et.tag_id
    where t.name in (${sql.join(tags)})
    group by et.entry_id
    having count(distinct t.name) = ${tags.length}
  )`;
}

export const entryTagNames = sql<string[]>`coalesce((
  select array_agg(distinct t.name order by t.name)
  from entry_tags et join tags t on t.id = et.tag_id
  where et.entry_id = entries.id
), '{}')`;

/** entries joined to feeds, selecting the EntryListItem columns. */
export function entryListQuery(db: Db) {
  return db
    .selectFrom("entries")
    .innerJoin("feeds", "feeds.id", "entries.feed_id")
    .select([
      "entries.id",
      "entries.feed_id as feedId",
      "feeds.title as feedTitle",
      "entries.url",
      "entries.title",
      "entries.summary",
      "entries.published_at as publishedAt",
      entryTagNames.as("tags"),
    ]);
}

export type EntryDetail = EntryListItem & { contentHtml: string; author: string | null; feedKind: "rss" | "bookmarks" };

export async function getEntry(db: Db, entryId: number): Promise<EntryDetail | null> {
  const row = await entryListQuery(db)
    .select(["entries.content_html as contentHtml", "entries.author", "feeds.kind as feedKind"])
    .where("entries.id", "=", entryId)
    .executeTakeFirst();
  return row ?? null;
}
