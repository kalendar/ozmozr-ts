import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { inTx, type Db } from "@/db/client";
import type { Profile } from "@/db/types";
import { ValidationError } from "@/lib/errors";

export type { Profile };

export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export function bookmarksFeedUrl(userId: string): string {
  return `ozmozr:bookmarks:${userId}`;
}

export async function isHandleAvailable(db: Db, handle: string): Promise<boolean> {
  const row = await db
    .selectFrom("profiles")
    .select("id")
    .where(sql<boolean>`lower(handle) = ${handle.toLowerCase()}`)
    .executeTakeFirst();
  return !row;
}

/**
 * Creates the profile for a new user, along with their personal bookmarks feed
 * (which they are subscribed to) and their private feed key.
 */
export async function createProfile(
  db: Db,
  input: { userId: string; handle: string; displayName: string },
): Promise<Profile> {
  const displayName = input.displayName.trim();
  if (!HANDLE_PATTERN.test(input.handle)) {
    throw new ValidationError("Handles are 3 to 30 characters: lowercase letters, numbers and underscores");
  }
  if (displayName.length < 1 || displayName.length > 80) {
    throw new ValidationError("Display name must be 1 to 80 characters");
  }
  return inTx(db, async (trx) => {
    if (!(await isHandleAvailable(trx, input.handle))) {
      throw new ValidationError("That handle is already taken");
    }
    const feed = await trx
      .insertInto("feeds")
      .values({ url: bookmarksFeedUrl(input.userId), kind: "bookmarks", title: `${displayName}'s saved links` })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx.insertInto("subscriptions").values({ user_id: input.userId, feed_id: feed.id }).execute();
    return trx
      .insertInto("profiles")
      .values({
        user_id: input.userId,
        handle: input.handle,
        display_name: displayName,
        feed_key: randomBytes(32).toString("base64url"),
        bookmark_feed_id: feed.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });
}

export async function getProfileByHandle(db: Db, handle: string): Promise<Profile | null> {
  const row = await db
    .selectFrom("profiles")
    .selectAll()
    .where(sql<boolean>`lower(handle) = ${handle.toLowerCase()}`)
    .executeTakeFirst();
  return row ?? null;
}

export async function getProfileByUserId(db: Db, userId: string): Promise<Profile | null> {
  const row = await db.selectFrom("profiles").selectAll().where("user_id", "=", userId).executeTakeFirst();
  return row ?? null;
}
