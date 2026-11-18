import type { Db } from "@/db/client";
import type { PersonRef } from "@/domain/people/profiles";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { getRole, requireRole } from "./repo";

export type CommentNode = { id: number; body: string; createdAt: Date; author: PersonRef; replies: CommentNode[] };

/** Adds a comment (or a reply, when parentId is given) to a shared entry. Members only. */
export async function addGroupComment(db: Db, userId: string, groupEntryId: number, body: string, parentId?: number): Promise<number> {
  const shared = await db.selectFrom("group_entries").select("group_id").where("id", "=", groupEntryId).executeTakeFirst();
  if (!shared) throw new NotFoundError("That entry is no longer in the group");
  await requireRole(db, userId, shared.group_id, "member");
  const text = body.trim();
  if (text.length < 1 || text.length > 5000) throw new ValidationError("Comments must be 1 to 5000 characters");
  if (parentId !== undefined) {
    const parent = await db.selectFrom("group_entry_comments").select("group_entry_id").where("id", "=", parentId).executeTakeFirst();
    if (!parent || parent.group_entry_id !== groupEntryId) throw new ValidationError("That comment cannot be replied to here");
  }
  const row = await db
    .insertInto("group_entry_comments")
    .values({ group_entry_id: groupEntryId, parent_id: parentId ?? null, author_id: userId, body: text })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Deletes a comment and its replies: allowed for its author and the group's owner. */
export async function deleteGroupComment(db: Db, userId: string, commentId: number): Promise<void> {
  const comment = await db
    .selectFrom("group_entry_comments as c")
    .innerJoin("group_entries as ge", "ge.id", "c.group_entry_id")
    .select(["c.author_id", "ge.group_id"])
    .where("c.id", "=", commentId)
    .executeTakeFirst();
  if (!comment) return;
  if (comment.author_id !== userId && (await getRole(db, userId, comment.group_id)) !== "owner") throw new ForbiddenError();
  await db.deleteFrom("group_entry_comments").where("id", "=", commentId).execute();
}

/** The discussion on a shared entry as a tree, oldest first at every level. */
export async function listGroupComments(db: Db, groupEntryId: number): Promise<CommentNode[]> {
  const rows = await db
    .selectFrom("group_entry_comments as c")
    .innerJoin("profiles as p", "p.user_id", "c.author_id")
    .select(["c.id", "c.parent_id", "c.body", "c.created_at as createdAt", "p.user_id as userId", "p.handle", "p.display_name as displayName", "p.avatar_path as avatarPath"])
    .where("c.group_entry_id", "=", groupEntryId)
    .orderBy("c.created_at")
    .orderBy("c.id")
    .execute();
  const nodes = new Map<number, CommentNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: { userId: r.userId, handle: r.handle, displayName: r.displayName, avatarPath: r.avatarPath },
      replies: [],
    });
  }
  const roots: CommentNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = r.parent_id === null ? undefined : nodes.get(r.parent_id);
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}
