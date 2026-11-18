import { Parser } from "htmlparser2";
import type { Db } from "@/db/client";
import { entryListQuery, PAGE_SIZE, pageOffset, type EntryListItem } from "@/domain/entries/query";
import { setEntryTags } from "@/domain/tags/repo";
import { ValidationError } from "@/lib/errors";
import { safeFetch, type SafeFetchOptions } from "@/lib/safe-fetch";
import { htmlToText } from "@/lib/sanitize";

function webUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ValidationError("Enter a full web address, starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ValidationError("Only web links can be saved");
  if (url.href.length > 2000) throw new ValidationError("That address is too long");
  return url.href;
}

/**
 * Saves a web page for a person. If any feed already delivered that address the
 * existing entry is reused; otherwise an entry is created in the person's own
 * bookmarks feed. Saving again updates the note and replaces the tags.
 */
export async function saveLink(
  db: Db,
  userId: string,
  input: { url: string; title: string; comment?: string; tags: string[] },
): Promise<{ entryId: number; created: boolean }> {
  const url = webUrl(input.url);
  const comment = (input.comment ?? "").trim().slice(0, 2000);
  let created = false;
  let entryId = (
    await db.selectFrom("entries").select("id").where("url", "=", url).orderBy("id").limit(1).executeTakeFirst()
  )?.id;

  if (entryId === undefined) {
    const profile = await db
      .selectFrom("profiles")
      .select("bookmark_feed_id")
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if (!profile?.bookmark_feed_id) throw new ValidationError("Your account has no place to save links");
    const inserted = await db
      .insertInto("entries")
      .values({
        feed_id: profile.bookmark_feed_id,
        guid: url,
        url,
        title: input.title.trim().slice(0, 300) || url,
      })
      .onConflict((oc) => oc.columns(["feed_id", "guid"]).doNothing())
      .returning("id")
      .executeTakeFirst();
    created = Boolean(inserted);
    entryId =
      inserted?.id ??
      (await db.selectFrom("entries").select("id").where("url", "=", url).orderBy("id").executeTakeFirstOrThrow()).id;
  }

  await db
    .insertInto("saves")
    .values({ user_id: userId, entry_id: entryId, comment })
    .onConflict((oc) => oc.columns(["user_id", "entry_id"]).doUpdateSet({ comment }))
    .execute();
  await setEntryTags(db, userId, entryId, input.tags);
  return { entryId, created };
}

export async function getSave(db: Db, userId: string, entryId: number): Promise<{ comment: string; createdAt: Date } | null> {
  const row = await db
    .selectFrom("saves")
    .select(["comment", "created_at as createdAt"])
    .where("user_id", "=", userId)
    .where("entry_id", "=", entryId)
    .executeTakeFirst();
  return row ?? null;
}

/** Removes a save and the person's tags on that entry. The entry itself stays. */
export async function unsaveLink(db: Db, userId: string, entryId: number): Promise<void> {
  await db.deleteFrom("saves").where("user_id", "=", userId).where("entry_id", "=", entryId).execute();
  await db.deleteFrom("entry_tags").where("user_id", "=", userId).where("entry_id", "=", entryId).execute();
}

/** A person's saved links, most recently saved first. These are public. */
export async function listSaved(db: Db, userId: string, opts: { page: number }): Promise<EntryListItem[]> {
  return entryListQuery(db)
    .innerJoin("saves", (join) => join.onRef("saves.entry_id", "=", "entries.id").on("saves.user_id", "=", userId))
    .orderBy("saves.created_at", "desc")
    .orderBy("entries.id", "desc")
    .limit(PAGE_SIZE)
    .offset(pageOffset(opts.page))
    .execute();
}

/** The <title> of a web page, or null if it cannot be fetched safely or has none. */
export async function fetchPageTitle(url: string, opts: SafeFetchOptions = {}): Promise<string | null> {
  try {
    const res = await safeFetch(url, { maxBytes: 2_000_000, timeoutMs: 8_000, ...opts });
    if (res.status < 200 || res.status >= 300) return null;
    let title = "";
    let inTitle = false;
    let done = false;
    const parser = new Parser({
      onopentag: (name) => {
        if (name === "title" && !done) inTitle = true;
      },
      ontext: (text) => {
        if (inTitle) title += text;
      },
      onclosetag: (name) => {
        if (name === "title" && inTitle) {
          inTitle = false;
          done = true;
        }
      },
    });
    parser.write(res.body.slice(0, 200_000));
    parser.end();
    return htmlToText(title, 300) || null;
  } catch {
    return null;
  }
}
