import { sql } from "kysely";
import type { Db } from "@/db/client";
import { NotFoundError } from "@/lib/errors";
import { normalizeTags } from "@/lib/tags";

/** Makes sure each tag name exists and returns name -> id. Names must already be normalised. */
export async function ensureTags(db: Db, names: readonly string[]): Promise<Map<string, number>> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return new Map();
  await db
    .insertInto("tags")
    .values(unique.map((name) => ({ name })))
    .onConflict((oc) => oc.column("name").doNothing())
    .execute();
  const rows = await db.selectFrom("tags").select(["id", "name"]).where("name", "in", unique).execute();
  return new Map(rows.map((r) => [r.name, r.id]));
}

/** Replaces the tags one person has put on an entry. Other people's tags and the feed's own are untouched. */
export async function setEntryTags(db: Db, userId: string, entryId: number, tags: readonly string[]): Promise<void> {
  const entry = await db.selectFrom("entries").select("id").where("id", "=", entryId).executeTakeFirst();
  if (!entry) throw new NotFoundError("That entry no longer exists");
  const names = normalizeTags(tags);
  const ids = await ensureTags(db, names);
  await db.deleteFrom("entry_tags").where("entry_id", "=", entryId).where("user_id", "=", userId).execute();
  if (names.length > 0) {
    await db
      .insertInto("entry_tags")
      .values(names.map((name) => ({ entry_id: entryId, tag_id: ids.get(name)!, user_id: userId })))
      .execute();
  }
}

export async function getMyEntryTags(db: Db, userId: string, entryId: number): Promise<string[]> {
  const rows = await db
    .selectFrom("entry_tags as et")
    .innerJoin("tags as t", "t.id", "et.tag_id")
    .select("t.name")
    .where("et.entry_id", "=", entryId)
    .where("et.user_id", "=", userId)
    .orderBy("t.name")
    .execute();
  return rows.map((r) => r.name);
}

/**
 * Tag ideas for an entry: `popular` are the tags most often applied to it
 * (the feed and each person count once per tag); `mine` are the tags this
 * person uses most.
 */
export async function suggestTags(
  db: Db,
  userId: string,
  entryId: number,
  limit = 8,
): Promise<{ popular: string[]; mine: string[] }> {
  const popular = await db
    .selectFrom("entry_tags as et")
    .innerJoin("tags as t", "t.id", "et.tag_id")
    .select("t.name")
    .where("et.entry_id", "=", entryId)
    .groupBy("t.name")
    .orderBy(sql`count(*)`, "desc")
    .orderBy("t.name")
    .limit(limit)
    .execute();
  const mine = await db
    .selectFrom("entry_tags as et")
    .innerJoin("tags as t", "t.id", "et.tag_id")
    .select("t.name")
    .where("et.user_id", "=", userId)
    .groupBy("t.name")
    .orderBy(sql`count(*)`, "desc")
    .orderBy("t.name")
    .limit(limit)
    .execute();
  return { popular: popular.map((r) => r.name), mine: mine.map((r) => r.name) };
}
