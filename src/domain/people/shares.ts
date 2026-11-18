import type { Db } from "@/db/client";
import { entryListQuery, PAGE_SIZE, pageOffset, type EntryListItem } from "@/domain/entries/query";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { listFriends } from "./friends";
import type { PersonRef } from "./profiles";

export type SharedItem = EntryListItem & { sharedBy: PersonRef; comment: string; sharedAt: Date };

/**
 * Shares an entry with friends, with an optional note. Everyone named must be
 * an accepted friend, or nothing is shared. Sharing again updates the note.
 */
export async function shareEntryWithFriends(
  db: Db,
  fromUserId: string,
  entryId: number,
  friendIds: readonly string[],
  comment = "",
): Promise<void> {
  const ids = [...new Set(friendIds)];
  if (ids.length === 0) return;
  const friends = new Set((await listFriends(db, fromUserId)).map((f) => f.userId));
  if (ids.some((id) => !friends.has(id))) throw new ForbiddenError("You can only share with your friends");
  const entry = await db.selectFrom("entries").select("id").where("id", "=", entryId).executeTakeFirst();
  if (!entry) throw new NotFoundError("That entry no longer exists");
  const note = comment.trim().slice(0, 2000);
  await db
    .insertInto("entry_shares")
    .values(ids.map((to) => ({ entry_id: entryId, from_user_id: fromUserId, to_user_id: to, comment: note })))
    .onConflict((oc) => oc.columns(["entry_id", "from_user_id", "to_user_id"]).doUpdateSet({ comment: note }))
    .execute();
}

export async function listSharedWithMe(db: Db, userId: string, opts: { page: number }): Promise<SharedItem[]> {
  const rows = await entryListQuery(db)
    .innerJoin("entry_shares as sh", "sh.entry_id", "entries.id")
    .innerJoin("profiles as p", "p.user_id", "sh.from_user_id")
    .select([
      "sh.comment",
      "sh.created_at as sharedAt",
      "p.user_id as sharerId",
      "p.handle as sharerHandle",
      "p.display_name as sharerName",
      "p.avatar_path as sharerAvatar",
    ])
    .where("sh.to_user_id", "=", userId)
    .orderBy("sh.created_at", "desc")
    .orderBy("sh.id", "desc")
    .limit(PAGE_SIZE)
    .offset(pageOffset(opts.page))
    .execute();
  return rows.map(({ sharerId, sharerHandle, sharerName, sharerAvatar, ...entry }) => ({
    ...entry,
    sharedBy: { userId: sharerId, handle: sharerHandle, displayName: sharerName, avatarPath: sharerAvatar },
  }));
}

/** Who this person has already shared an entry with. */
export async function listMySharesOfEntry(db: Db, userId: string, entryId: number): Promise<string[]> {
  const rows = await db
    .selectFrom("entry_shares")
    .select("to_user_id")
    .where("from_user_id", "=", userId)
    .where("entry_id", "=", entryId)
    .execute();
  return rows.map((r) => r.to_user_id);
}
