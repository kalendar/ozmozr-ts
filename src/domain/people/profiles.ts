import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import { inTx, type Db } from "@/db/client";
import type { Profile } from "@/db/types";
import { ForbiddenError, ValidationError } from "@/lib/errors";

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

/** The owner of a private feed key (used by /news.rss and /calendar.ics), or null. */
export async function getUserIdByFeedKey(db: Db, key: string): Promise<string | null> {
  if (!key || key.length > 100) return null;
  const row = await db.selectFrom("profiles").select("user_id").where("feed_key", "=", key).executeTakeFirst();
  return row?.user_id ?? null;
}

export type PersonListItem = {
  userId: string;
  handle: string;
  displayName: string;
  avatarPath: string | null;
  blurb: string;
};

/** Column list producing a PersonListItem from the profiles table (aliased or not). */
export const personColumns = [
  "profiles.user_id as userId",
  "profiles.handle",
  "profiles.display_name as displayName",
  "profiles.avatar_path as avatarPath",
  "profiles.blurb",
] as const;

export type PersonRef = { userId: string; handle: string; displayName: string; avatarPath: string | null };

export async function updateProfile(
  db: Db,
  userId: string,
  input: { displayName: string; blurb: string; location: string; website: string },
): Promise<void> {
  const displayName = input.displayName.trim();
  const blurb = input.blurb.trim();
  const location = input.location.trim();
  let website = input.website.trim();
  if (displayName.length < 1 || displayName.length > 80) throw new ValidationError("Display name must be 1 to 80 characters");
  if (blurb.length > 2000) throw new ValidationError("Your blurb can be at most 2000 characters");
  if (location.length > 100) throw new ValidationError("Location can be at most 100 characters");
  if (website) {
    let url: URL;
    try {
      url = new URL(website);
    } catch {
      throw new ValidationError("Website must be a full address starting with https://");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new ValidationError("Website must be an http or https address");
    if (url.href.length > 2000) throw new ValidationError("That website address is too long");
    website = url.href;
  }
  await db
    .updateTable("profiles")
    .set({ display_name: displayName, blurb, location, website })
    .where("user_id", "=", userId)
    .execute();
}

export async function setAvatar(db: Db, userId: string, avatarPath: string | null): Promise<void> {
  await db.updateTable("profiles").set({ avatar_path: avatarPath }).where("user_id", "=", userId).execute();
}

/** The people directory. `tags` keeps people who have used every one of the tags. */
export async function listPeople(
  db: Db,
  opts: { sort: "new" | "alpha"; tags?: string[]; page: number },
): Promise<PersonListItem[]> {
  let q = db.selectFrom("profiles").select(personColumns);
  if (opts.tags && opts.tags.length > 0) {
    q = q.where(
      sql<boolean>`profiles.user_id in (
        select et.user_id from entry_tags et join tags t on t.id = et.tag_id
        where et.user_id is not null and t.name in (${sql.join(opts.tags)})
        group by et.user_id having count(distinct t.name) = ${opts.tags.length}
      )`,
    );
  }
  q = opts.sort === "new"
    ? q.orderBy("profiles.created_at", "desc").orderBy("profiles.id", "desc")
    : q.orderBy(sql`lower(profiles.display_name)`).orderBy("profiles.id");
  const page = Math.max(1, Math.floor(opts.page) || 1);
  return q.limit(20).offset((page - 1) * 20).execute();
}

/** The tags a person uses most on entries, sorted by name. */
export async function userTagCloud(db: Db, userId: string, limit = 50): Promise<{ name: string; count: number }[]> {
  const result = await sql<{ name: string; count: number }>`
    select name, count from (
      select t.name, count(*) as count from entry_tags et join tags t on t.id = et.tag_id
      where et.user_id = ${userId}
      group by t.name order by count(*) desc, t.name limit ${limit}
    ) top order by name
  `.execute(db);
  return result.rows;
}

export type ProfileComment = { id: number; body: string; createdAt: Date; author: PersonRef };

export async function addProfileComment(db: Db, authorId: string, profileUserId: string, body: string): Promise<void> {
  const text = body.trim();
  if (text.length < 1 || text.length > 2000) throw new ValidationError("Comments must be 1 to 2000 characters");
  await db.insertInto("profile_comments").values({ profile_user_id: profileUserId, author_id: authorId, body: text }).execute();
}

export async function listProfileComments(db: Db, profileUserId: string, limit = 50): Promise<ProfileComment[]> {
  const rows = await db
    .selectFrom("profile_comments as c")
    .innerJoin("profiles as p", "p.user_id", "c.author_id")
    .select(["c.id", "c.body", "c.created_at as createdAt", "p.user_id as userId", "p.handle", "p.display_name as displayName", "p.avatar_path as avatarPath"])
    .where("c.profile_user_id", "=", profileUserId)
    .orderBy("c.created_at", "desc")
    .orderBy("c.id", "desc")
    .limit(limit)
    .execute();
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    author: { userId: r.userId, handle: r.handle, displayName: r.displayName, avatarPath: r.avatarPath },
  }));
}

/** Deletes a wall comment; allowed for its author and for the owner of the profile. */
export async function deleteProfileComment(db: Db, userId: string, commentId: number): Promise<void> {
  const comment = await db.selectFrom("profile_comments").selectAll().where("id", "=", commentId).executeTakeFirst();
  if (!comment) return;
  if (comment.author_id !== userId && comment.profile_user_id !== userId) throw new ForbiddenError();
  await db.deleteFrom("profile_comments").where("id", "=", commentId).execute();
}

/** The handle of the person whose saved-links feed this is, or null for an ordinary feed. */
export async function getBookmarkFeedOwnerHandle(db: Db, feedId: number): Promise<string | null> {
  const row = await db.selectFrom("profiles").select("handle").where("bookmark_feed_id", "=", feedId).executeTakeFirst();
  return row?.handle ?? null;
}
