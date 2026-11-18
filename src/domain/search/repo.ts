import { sql } from "kysely";
import type { Db } from "@/db/client";
import { entryHasAllTags, entryListQuery, PAGE_SIZE, pageOffset, type EntryListItem } from "@/domain/entries/query";
import type { FeedListItem } from "@/domain/feeds/repo";
import { personColumns, type PersonListItem } from "@/domain/people/profiles";

export type GroupSearchItem = { id: number; slug: string; title: string; description: string; imagePath: string | null; memberCount: number };

export type SearchType = "entries" | "feeds" | "people" | "groups";
export type SearchResult =
  | { type: "entries"; items: EntryListItem[] }
  | { type: "feeds"; items: FeedListItem[] }
  | { type: "people"; items: PersonListItem[] }
  | { type: "groups"; items: GroupSearchItem[] };

/** Hook the groups phase fills in; groups do not exist before then. */
type GroupSearch = (db: Db, q: string, page: number) => Promise<GroupSearchItem[]>;
let groupSearch: GroupSearch = async () => [];
export function registerGroupSearch(fn: GroupSearch): void {
  groupSearch = fn;
}

function usable(q: string): string | null {
  const trimmed = q.trim().slice(0, 200);
  return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : null;
}

/** Full-text search. Queries use web-search syntax: quotes for phrases, -word to exclude. */
export async function search(db: Db, q: string, opts: { type: "entries"; page: number }): Promise<{ type: "entries"; items: EntryListItem[] }>;
export async function search(db: Db, q: string, opts: { type: "feeds"; page: number }): Promise<{ type: "feeds"; items: FeedListItem[] }>;
export async function search(db: Db, q: string, opts: { type: "people"; page: number }): Promise<{ type: "people"; items: PersonListItem[] }>;
export async function search(db: Db, q: string, opts: { type: "groups"; page: number }): Promise<{ type: "groups"; items: GroupSearchItem[] }>;
export async function search(db: Db, q: string, opts: { type: SearchType; page: number }): Promise<SearchResult>;
export async function search(db: Db, q: string, opts: { type: SearchType; page: number }): Promise<SearchResult> {
  const text = usable(q);
  const offset = pageOffset(opts.page);
  const query = sql`websearch_to_tsquery('english', ${text ?? ""})`;

  if (opts.type === "entries") {
    if (!text) return { type: "entries", items: [] };
    const items = await entryListQuery(db)
      .where(sql<boolean>`entries.search @@ ${query}`)
      .orderBy(sql`ts_rank(entries.search, ${query})`, "desc")
      .orderBy("entries.published_at", "desc")
      .orderBy("entries.id", "desc")
      .limit(PAGE_SIZE)
      .offset(offset)
      .execute();
    return { type: "entries", items };
  }

  if (opts.type === "feeds") {
    if (!text) return { type: "feeds", items: [] };
    const items = await db
      .selectFrom("feeds")
      .leftJoin("subscriptions as s", "s.feed_id", "feeds.id")
      .where("feeds.kind", "=", "rss")
      .where(sql<boolean>`feeds.search @@ ${query}`)
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
        sql<boolean>`false`.as("subscribed"),
      ])
      .orderBy(sql`ts_rank(feeds.search, ${query})`, "desc")
      .orderBy(sql`count(s.id)`, "desc")
      .orderBy("feeds.id")
      .limit(PAGE_SIZE)
      .offset(offset)
      .execute();
    return { type: "feeds", items };
  }

  if (opts.type === "people") {
    if (!text) return { type: "people", items: [] };
    const simple = sql`websearch_to_tsquery('simple', ${text})`;
    const prefix = `${text.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
    const items = await db
      .selectFrom("profiles")
      .select(personColumns)
      .where(
        sql<boolean>`(profiles.search @@ ${query} or profiles.search @@ ${simple} or lower(profiles.handle) like ${prefix})`,
      )
      .orderBy(sql`ts_rank(profiles.search, ${simple})`, "desc")
      .orderBy("profiles.handle")
      .limit(PAGE_SIZE)
      .offset(offset)
      .execute();
    return { type: "people", items };
  }

  return { type: "groups", items: text ? await groupSearch(db, text, opts.page) : [] };
}

/** Public tag browse across every feed, personal bookmark feeds included. */
export async function listEntriesByTags(db: Db, tags: readonly string[], opts: { page: number }): Promise<EntryListItem[]> {
  if (tags.length === 0) return [];
  return entryListQuery(db)
    .where(entryHasAllTags(tags))
    .orderBy("entries.published_at", "desc")
    .orderBy("entries.id", "desc")
    .limit(PAGE_SIZE)
    .offset(pageOffset(opts.page))
    .execute();
}

/** The tags on the most entries, sorted by name. */
export async function globalTagCloud(db: Db, limit = 60): Promise<{ name: string; count: number }[]> {
  const result = await sql<{ name: string; count: number }>`
    select name, count from (
      select t.name, count(distinct et.entry_id) as count
      from entry_tags et join tags t on t.id = et.tag_id
      group by t.name
      order by count(distinct et.entry_id) desc, t.name
      limit ${limit}
    ) top
    order by name
  `.execute(db);
  return result.rows;
}
