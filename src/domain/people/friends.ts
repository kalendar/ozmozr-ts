import { sql } from "kysely";
import type { Db } from "@/db/client";
import { ensureTags } from "@/domain/tags/repo";
import { ValidationError } from "@/lib/errors";
import { normalizeTags } from "@/lib/tags";
import { personColumns, type PersonListItem } from "./profiles";

export type FriendStatus = "none" | "pending-out" | "pending-in" | "friends";

/** The single friendship row between two people, whichever of them asked. */
async function findFriendship(db: Db, a: string, b: string) {
  return db
    .selectFrom("friendships")
    .selectAll()
    .where((eb) =>
      eb.or([
        eb.and([eb("user_id", "=", a), eb("friend_id", "=", b)]),
        eb.and([eb("user_id", "=", b), eb("friend_id", "=", a)]),
      ]),
    )
    .executeTakeFirst();
}

export async function friendStatus(db: Db, userId: string, otherId: string): Promise<FriendStatus> {
  const row = await findFriendship(db, userId, otherId);
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.user_id === userId ? "pending-out" : "pending-in";
}

/** Replaces the tags one person has put on a friend (or on a pending request). Ignored if there is no friendship. */
export async function setFriendTags(db: Db, userId: string, friendId: string, tags: readonly string[]): Promise<void> {
  const row = await findFriendship(db, userId, friendId);
  if (!row) return;
  const names = normalizeTags(tags);
  const ids = await ensureTags(db, names);
  await db.deleteFrom("friendship_tags").where("friendship_id", "=", row.id).where("owner_id", "=", userId).execute();
  if (names.length > 0) {
    await db
      .insertInto("friendship_tags")
      .values(names.map((name) => ({ friendship_id: row.id, tag_id: ids.get(name)!, owner_id: userId })))
      .execute();
  }
}

export async function getFriendTags(db: Db, userId: string, friendId: string): Promise<string[]> {
  const row = await findFriendship(db, userId, friendId);
  if (!row) return [];
  const tags = await db
    .selectFrom("friendship_tags as ft")
    .innerJoin("tags as t", "t.id", "ft.tag_id")
    .select("t.name")
    .where("ft.friendship_id", "=", row.id)
    .where("ft.owner_id", "=", userId)
    .orderBy("t.name")
    .execute();
  return tags.map((t) => t.name);
}

/**
 * Asks someone to be a friend. If they had already asked, this accepts instead.
 */
export async function requestFriend(
  db: Db,
  userId: string,
  friendId: string,
  tags?: readonly string[],
): Promise<"requested" | "accepted" | "exists"> {
  if (userId === friendId) throw new ValidationError("You cannot add yourself as a friend");
  const target = await db.selectFrom("profiles").select("user_id").where("user_id", "=", friendId).executeTakeFirst();
  if (!target) throw new ValidationError("That person does not exist");

  const existing = await findFriendship(db, userId, friendId);
  let outcome: "requested" | "accepted" | "exists";
  if (!existing) {
    await db.insertInto("friendships").values({ user_id: userId, friend_id: friendId }).execute();
    outcome = "requested";
  } else if (existing.status === "pending" && existing.friend_id === userId) {
    await db.updateTable("friendships").set({ status: "accepted" }).where("id", "=", existing.id).execute();
    outcome = "accepted";
  } else {
    outcome = "exists";
  }
  if (tags && tags.length > 0) await setFriendTags(db, userId, friendId, tags);
  return outcome;
}

/** Accepts or declines a request. Only the person who was asked can do this. */
export async function respondToRequest(db: Db, userId: string, requesterId: string, accept: boolean): Promise<void> {
  const pending = db
    .selectFrom("friendships")
    .select("id")
    .where("user_id", "=", requesterId)
    .where("friend_id", "=", userId)
    .where("status", "=", "pending");
  if (accept) {
    await db.updateTable("friendships").set({ status: "accepted" }).where("id", "in", pending).execute();
  } else {
    await db.deleteFrom("friendships").where("id", "in", pending).execute();
  }
}

/** Ends a friendship or withdraws a request, from either side. */
export async function removeFriend(db: Db, userId: string, friendId: string): Promise<void> {
  const row = await findFriendship(db, userId, friendId);
  if (row) await db.deleteFrom("friendships").where("id", "=", row.id).execute();
}

/** Accepted friends, by name. `tags` keeps friends this person has given every tag. */
export async function listFriends(db: Db, userId: string, opts: { tags?: string[] } = {}): Promise<PersonListItem[]> {
  let q = db
    .selectFrom("friendships as f")
    .innerJoin("profiles", (join) =>
      join.on(sql<boolean>`profiles.user_id = case when f.user_id = ${userId} then f.friend_id else f.user_id end`),
    )
    .select(personColumns)
    .where("f.status", "=", "accepted")
    .where((eb) => eb.or([eb("f.user_id", "=", userId), eb("f.friend_id", "=", userId)]));
  if (opts.tags && opts.tags.length > 0) {
    q = q.where(
      sql<boolean>`f.id in (
        select ft.friendship_id from friendship_tags ft join tags t on t.id = ft.tag_id
        where ft.owner_id = ${userId} and t.name in (${sql.join(opts.tags)})
        group by ft.friendship_id having count(distinct t.name) = ${opts.tags.length}
      )`,
    );
  }
  return q.orderBy(sql`lower(profiles.display_name)`).orderBy("profiles.id").execute();
}

/** People who have asked this person and are waiting for an answer. */
export async function listPendingRequests(db: Db, userId: string): Promise<PersonListItem[]> {
  return db
    .selectFrom("friendships as f")
    .innerJoin("profiles", "profiles.user_id", "f.user_id")
    .select(personColumns)
    .where("f.friend_id", "=", userId)
    .where("f.status", "=", "pending")
    .orderBy("f.created_at", "desc")
    .execute();
}

/** People this person has asked who have not answered yet. */
export async function listSentRequests(db: Db, userId: string): Promise<PersonListItem[]> {
  return db
    .selectFrom("friendships as f")
    .innerJoin("profiles", "profiles.user_id", "f.friend_id")
    .select(personColumns)
    .where("f.user_id", "=", userId)
    .where("f.status", "=", "pending")
    .orderBy("f.created_at", "desc")
    .execute();
}

/** The tags this person has put on friends, with counts. */
export async function friendTagCloud(db: Db, userId: string): Promise<{ name: string; count: number }[]> {
  const result = await sql<{ name: string; count: number }>`
    select t.name, count(*) as count from friendship_tags ft join tags t on t.id = ft.tag_id
    where ft.owner_id = ${userId} group by t.name order by t.name
  `.execute(db);
  return result.rows;
}
