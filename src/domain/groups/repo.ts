import { sql } from "kysely";
import { inTx, type Db } from "@/db/client";
import type { Group } from "@/db/types";
import { PAGE_SIZE, pageOffset } from "@/domain/entries/query";
import type { PersonListItem } from "@/domain/people/profiles";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export type { Group };
export type GroupRole = "owner" | "member";
export type GroupListItem = {
  id: number;
  slug: string;
  title: string;
  description: string;
  imagePath: string | null;
  memberCount: number;
  createdAt: Date;
};

export const SLUG_PATTERN = /^[a-z0-9-]{3,40}$/;
const RESERVED_SLUGS = new Set(["new"]);

function checkText(input: { title: string; description: string }): { title: string; description: string } {
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 1 || title.length > 100) throw new ValidationError("Group name must be 1 to 100 characters");
  if (description.length < 1 || description.length > 3000) throw new ValidationError("Description must be 1 to 3000 characters");
  return { title, description };
}

async function titleTaken(db: Db, title: string, exceptId?: number): Promise<boolean> {
  let q = db.selectFrom("groups").select("id").where(sql<boolean>`lower(title) = ${title.toLowerCase()}`);
  if (exceptId !== undefined) q = q.where("id", "<>", exceptId);
  return Boolean(await q.executeTakeFirst());
}

/** Creates a group; the creator becomes its owner. */
export async function createGroup(
  db: Db,
  ownerId: string,
  input: { title: string; slug: string; description: string; imagePath?: string },
): Promise<Group> {
  const { title, description } = checkText(input);
  if (!SLUG_PATTERN.test(input.slug) || RESERVED_SLUGS.has(input.slug)) {
    throw new ValidationError("Group addresses are 3 to 40 characters: lowercase letters, numbers and hyphens");
  }
  return inTx(db, async (trx) => {
    if (await trx.selectFrom("groups").select("id").where("slug", "=", input.slug).executeTakeFirst()) {
      throw new ValidationError("That group address is already taken");
    }
    if (await titleTaken(trx, title)) throw new ValidationError("A group with that name already exists");
    const group = await trx
      .insertInto("groups")
      .values({ slug: input.slug, title, description, image_path: input.imagePath ?? null })
      .returning(["id", "slug", "title", "description", "image_path", "created_at"])
      .executeTakeFirstOrThrow();
    await trx.insertInto("group_members").values({ group_id: group.id, user_id: ownerId, role: "owner" }).execute();
    return group;
  });
}

export async function getRole(db: Db, userId: string, groupId: number): Promise<GroupRole | null> {
  const row = await db
    .selectFrom("group_members")
    .select("role")
    .where("group_id", "=", groupId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return row?.role ?? null;
}

/** Throws ForbiddenError unless the person holds the role. An owner also counts as a member. */
export async function requireRole(db: Db, userId: string, groupId: number, role: GroupRole): Promise<void> {
  const actual = await getRole(db, userId, groupId);
  if (actual === "owner" || (actual === "member" && role === "member")) return;
  throw new ForbiddenError(role === "owner" ? "Only the group's owner can do that" : "Only members of the group can do that");
}

export async function updateGroup(
  db: Db,
  userId: string,
  groupId: number,
  input: { title: string; description: string; imagePath?: string },
): Promise<void> {
  await requireRole(db, userId, groupId, "owner");
  const { title, description } = checkText(input);
  if (await titleTaken(db, title, groupId)) throw new ValidationError("A group with that name already exists");
  await db
    .updateTable("groups")
    .set({ title, description, ...(input.imagePath ? { image_path: input.imagePath } : {}) })
    .where("id", "=", groupId)
    .execute();
}

export async function deleteGroup(db: Db, userId: string, groupId: number): Promise<void> {
  await requireRole(db, userId, groupId, "owner");
  await db.deleteFrom("groups").where("id", "=", groupId).execute();
}

export async function joinGroup(db: Db, userId: string, groupId: number): Promise<void> {
  const group = await db.selectFrom("groups").select("id").where("id", "=", groupId).executeTakeFirst();
  if (!group) throw new NotFoundError("That group no longer exists");
  await db
    .insertInto("group_members")
    .values({ group_id: groupId, user_id: userId })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

export async function leaveGroup(db: Db, userId: string, groupId: number): Promise<void> {
  if ((await getRole(db, userId, groupId)) === "owner") {
    throw new ValidationError("The owner cannot leave the group. Delete it instead.");
  }
  await db.deleteFrom("group_members").where("group_id", "=", groupId).where("user_id", "=", userId).execute();
}

const memberCount = sql<number>`(select count(*) from group_members gm where gm.group_id = groups.id)`;

function groupListQuery(db: Db) {
  return db
    .selectFrom("groups")
    .select([
      "groups.id",
      "groups.slug",
      "groups.title",
      "groups.description",
      "groups.image_path as imagePath",
      "groups.created_at as createdAt",
      memberCount.as("memberCount"),
    ]);
}

export async function getGroupBySlug(
  db: Db,
  slug: string,
  userId?: string,
): Promise<(GroupListItem & { role: GroupRole | null }) | null> {
  const group = await groupListQuery(db).where("groups.slug", "=", slug.toLowerCase()).executeTakeFirst();
  if (!group) return null;
  return { ...group, role: userId ? await getRole(db, userId, group.id) : null };
}

export async function listGroups(
  db: Db,
  opts: { userId?: string; sort: "popular" | "new" | "alpha"; mine?: boolean; page: number },
): Promise<GroupListItem[]> {
  let q = groupListQuery(db);
  if (opts.mine) {
    if (!opts.userId) return [];
    q = q.where("groups.id", "in", db.selectFrom("group_members").select("group_id").where("user_id", "=", opts.userId));
  }
  if (opts.sort === "popular") q = q.orderBy(memberCount, "desc").orderBy(sql`lower(groups.title)`);
  else if (opts.sort === "new") q = q.orderBy("groups.created_at", "desc").orderBy("groups.id", "desc");
  else q = q.orderBy(sql`lower(groups.title)`);
  return q.orderBy("groups.id").limit(PAGE_SIZE).offset(pageOffset(opts.page)).execute();
}

/** Every group a person belongs to, by name. */
export async function listGroupsForUser(db: Db, userId: string): Promise<GroupListItem[]> {
  return groupListQuery(db)
    .where("groups.id", "in", db.selectFrom("group_members").select("group_id").where("user_id", "=", userId))
    .orderBy(sql`lower(groups.title)`)
    .execute();
}

export async function searchGroups(db: Db, q: string, page: number): Promise<GroupListItem[]> {
  const query = sql`websearch_to_tsquery('english', ${q})`;
  return groupListQuery(db)
    .where(sql<boolean>`groups.search @@ ${query}`)
    .orderBy(sql`ts_rank(groups.search, ${query})`, "desc")
    .orderBy("groups.id")
    .limit(PAGE_SIZE)
    .offset(pageOffset(page))
    .execute();
}

export async function listMembers(db: Db, groupId: number): Promise<(PersonListItem & { role: GroupRole })[]> {
  return db
    .selectFrom("group_members as gm")
    .innerJoin("profiles", "profiles.user_id", "gm.user_id")
    .select([
      "profiles.user_id as userId",
      "profiles.handle",
      "profiles.display_name as displayName",
      "profiles.avatar_path as avatarPath",
      "profiles.blurb",
      "gm.role",
    ])
    .where("gm.group_id", "=", groupId)
    .orderBy(sql`gm.role = 'owner'`, "desc")
    .orderBy("gm.created_at")
    .orderBy(sql`lower(profiles.display_name)`)
    .execute();
}
