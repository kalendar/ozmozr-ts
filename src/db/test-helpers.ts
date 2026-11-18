import type { Db } from "./client";
import { createProfile } from "@/domain/people/profiles";

/** Creates an auth user and profile; returns the user id. */
export async function makeUser(db: Db, handle: string): Promise<string> {
  const id = `u_${handle}`;
  await db
    .insertInto("user")
    .values({ id, name: handle, email: `${handle}@example.test`, emailVerified: false })
    .execute();
  await createProfile(db, { userId: id, handle, displayName: handle });
  return id;
}

export async function makeBareUser(db: Db, id: string): Promise<string> {
  await db.insertInto("user").values({ id, name: id, email: `${id}@example.test`, emailVerified: false }).execute();
  return id;
}

export async function makeFeed(db: Db, url: string, title = ""): Promise<number> {
  return (await db.insertInto("feeds").values({ url, title }).returning("id").executeTakeFirstOrThrow()).id;
}

/** Inserts an entry; `tags` become source tags (as if they came from the feed). */
export async function makeEntry(
  db: Db,
  feedId: number,
  input: { title: string; publishedAt?: string; tags?: string[]; url?: string },
): Promise<number> {
  const entry = await db
    .insertInto("entries")
    .values({
      feed_id: feedId,
      guid: input.title,
      title: input.title,
      url: input.url ?? `https://entries.example/${feedId}/${encodeURIComponent(input.title)}`,
      published_at: input.publishedAt ?? "2026-11-17T00:00:00Z",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  for (const name of input.tags ?? []) {
    const tag =
      (await db.selectFrom("tags").select("id").where("name", "=", name).executeTakeFirst()) ??
      (await db.insertInto("tags").values({ name }).returning("id").executeTakeFirstOrThrow());
    await db.insertInto("entry_tags").values({ entry_id: entry.id, tag_id: tag.id, user_id: null }).execute();
  }
  return entry.id;
}
