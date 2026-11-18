import { sql } from "kysely";
import type { Db } from "@/db/client";
import { ValidationError } from "@/lib/errors";
import { requireRole } from "./repo";

export type GroupLink = { id: number; url: string; title: string; position: number };

/** Pins a link (a FAQ, a forum…) to a group. Owner only. New links go last. */
export async function addGroupLink(db: Db, userId: string, groupId: number, input: { url: string; title: string }): Promise<number> {
  await requireRole(db, userId, groupId, "owner");
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) throw new ValidationError("Link titles must be 1 to 200 characters");
  let url: URL;
  try {
    url = new URL(input.url.trim());
  } catch {
    throw new ValidationError("Enter a full web address, starting with https://");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.href.length > 2000) {
    throw new ValidationError("Only http and https links can be pinned");
  }
  const row = await db
    .insertInto("group_links")
    .values({
      group_id: groupId,
      url: url.href,
      title,
      position: sql<number>`(select coalesce(max(position), 0) + 1 from group_links where group_id = ${groupId})`,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function removeGroupLink(db: Db, userId: string, groupId: number, linkId: number): Promise<void> {
  await requireRole(db, userId, groupId, "owner");
  await db.deleteFrom("group_links").where("id", "=", linkId).where("group_id", "=", groupId).execute();
}

/** Sets the order of a group's links. Ignored unless the ids are exactly this group's links. */
export async function reorderGroupLinks(db: Db, userId: string, groupId: number, orderedIds: readonly number[]): Promise<void> {
  await requireRole(db, userId, groupId, "owner");
  const current = (await listGroupLinks(db, groupId)).map((l) => l.id).sort((a, b) => a - b);
  const wanted = [...new Set(orderedIds)].sort((a, b) => a - b);
  if (current.length !== wanted.length || current.some((id, i) => id !== wanted[i])) return;
  for (const [index, id] of orderedIds.entries()) {
    await db.updateTable("group_links").set({ position: index + 1 }).where("id", "=", id).where("group_id", "=", groupId).execute();
  }
}

export async function listGroupLinks(db: Db, groupId: number): Promise<GroupLink[]> {
  return db
    .selectFrom("group_links")
    .select(["id", "url", "title", "position"])
    .where("group_id", "=", groupId)
    .orderBy("position")
    .orderBy("id")
    .execute();
}
