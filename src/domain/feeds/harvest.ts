import type { Db } from "@/db/client";
import { ensureTags } from "@/domain/tags/repo";
import { safeFetch, type SafeFetchOptions } from "@/lib/safe-fetch";
import { parseFeed, type ParsedItem } from "./parse";

export type HarvestResult = { status: "updated" | "not-modified" | "failed" | "skipped"; newEntries: number };

/** Minutes until the next attempt: hourly, doubling per consecutive failure, capped at 64 hours. */
export function nextRefreshDelayMinutes(failureCount: number): number {
  return 60 * 2 ** Math.min(Math.max(failureCount, 0), 6);
}

function minutesFrom(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

async function storeItems(db: Db, feedId: number, items: ParsedItem[], now: Date): Promise<number> {
  if (items.length === 0) return 0;
  const byGuid = new Map(items.map((i) => [i.guid, i]));
  const inserted = await db
    .insertInto("entries")
    .values(
      [...byGuid.values()].map((i) => ({
        feed_id: feedId,
        guid: i.guid,
        url: i.url,
        title: i.title,
        summary: i.summary,
        content_html: i.contentHtml,
        author: i.author,
        published_at: i.publishedAt && i.publishedAt <= now ? i.publishedAt : now,
      })),
    )
    .onConflict((oc) => oc.columns(["feed_id", "guid"]).doNothing())
    .returning(["id", "guid"])
    .execute();

  const links: { entry_id: number; tag: string }[] = [];
  for (const row of inserted) {
    for (const tag of byGuid.get(row.guid)?.categories ?? []) links.push({ entry_id: row.id, tag });
  }
  if (links.length > 0) {
    const ids = await ensureTags(db, links.map((l) => l.tag));
    await db
      .insertInto("entry_tags")
      .values(links.map((l) => ({ entry_id: l.entry_id, tag_id: ids.get(l.tag)!, user_id: null })))
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
  return inserted.length;
}

/**
 * Fetches one feed and stores any entries it has not seen. Never throws: a
 * failure is recorded on the feed and pushes its next attempt further out.
 */
export async function harvestFeed(
  db: Db,
  feedId: number,
  now: Date = new Date(),
  fetchOpts: SafeFetchOptions = {},
): Promise<HarvestResult> {
  const feed = await db.selectFrom("feeds").selectAll().where("id", "=", feedId).executeTakeFirst();
  if (!feed || feed.kind !== "rss") return { status: "skipped", newEntries: 0 };

  try {
    const headers: Record<string, string> = {};
    if (feed.etag) headers["If-None-Match"] = feed.etag;
    if (feed.last_modified) headers["If-Modified-Since"] = feed.last_modified;
    const res = await safeFetch(feed.url, { ...fetchOpts, headers });

    const scheduled = { refreshed_at: now, next_refresh_at: minutesFrom(now, 60), failure_count: 0, last_error: null };
    if (res.status === 304) {
      await db.updateTable("feeds").set(scheduled).where("id", "=", feedId).execute();
      return { status: "not-modified", newEntries: 0 };
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`The feed's server answered ${res.status}`);

    const parsed = parseFeed(res.body, res.finalUrl);
    const newEntries = await storeItems(db, feedId, parsed.items, now);
    await db
      .updateTable("feeds")
      .set({
        ...scheduled,
        etag: res.headers.get("etag"),
        last_modified: res.headers.get("last-modified"),
        title: feed.title || parsed.title.slice(0, 300),
        description: feed.description || parsed.description,
        site_url: feed.site_url ?? parsed.siteUrl,
      })
      .where("id", "=", feedId)
      .execute();
    return { status: "updated", newEntries };
  } catch (err) {
    const failures = feed.failure_count + 1;
    await db
      .updateTable("feeds")
      .set({
        failure_count: failures,
        last_error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        next_refresh_at: minutesFrom(now, nextRefreshDelayMinutes(failures)),
      })
      .where("id", "=", feedId)
      .execute();
    return { status: "failed", newEntries: 0 };
  }
}
