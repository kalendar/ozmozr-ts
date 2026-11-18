import { sql } from "kysely";
import type { Db } from "@/db/client";
import { NotFoundError } from "@/lib/errors";
import { requireRole } from "./repo";

/**
 * Casts a member's vote on a shared entry. Voting the same way again takes the
 * vote back; voting the other way replaces it.
 */
export async function vote(db: Db, userId: string, groupEntryId: number, value: 1 | -1): Promise<{ score: number; myVote: 1 | -1 | 0 }> {
  const shared = await db.selectFrom("group_entries").select("group_id").where("id", "=", groupEntryId).executeTakeFirst();
  if (!shared) throw new NotFoundError("That entry is no longer in the group");
  await requireRole(db, userId, shared.group_id, "member");

  const existing = await db
    .selectFrom("group_entry_votes")
    .select("value")
    .where("group_entry_id", "=", groupEntryId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  let myVote: 1 | -1 | 0;
  if (existing?.value === value) {
    await db.deleteFrom("group_entry_votes").where("group_entry_id", "=", groupEntryId).where("user_id", "=", userId).execute();
    myVote = 0;
  } else {
    await db
      .insertInto("group_entry_votes")
      .values({ group_entry_id: groupEntryId, user_id: userId, value })
      .onConflict((oc) => oc.columns(["group_entry_id", "user_id"]).doUpdateSet({ value }))
      .execute();
    myVote = value;
  }
  const { score } = await db
    .selectFrom("group_entry_votes")
    .select(sql<number>`coalesce(sum(value), 0)::int`.as("score"))
    .where("group_entry_id", "=", groupEntryId)
    .executeTakeFirstOrThrow();
  return { score, myVote };
}
