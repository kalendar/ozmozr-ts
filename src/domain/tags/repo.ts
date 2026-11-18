import type { Db } from "@/db/client";

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
