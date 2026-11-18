"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { subscribeToUrl } from "@/domain/feeds/repo";
import { harvestFeed } from "@/domain/feeds/harvest";
import { addGroupComment, deleteGroupComment } from "@/domain/groups/comments";
import { addGroupFeed, removeGroupEntry, removeGroupFeed, shareEntryWithGroup } from "@/domain/groups/entries";
import { addGroupLink, listGroupLinks, removeGroupLink, reorderGroupLinks } from "@/domain/groups/links";
import { createGroup, deleteGroup, joinGroup, leaveGroup, requireRole, updateGroup } from "@/domain/groups/repo";
import { vote } from "@/domain/groups/votes";
import { failure, formId, formString, type FormState } from "@/lib/action";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { saveImage } from "@/lib/storage";

function slugOf(form: FormData): string {
  const slug = formString(form, "slug");
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) throw new ValidationError("Something was missing from that request");
  return slug;
}

async function optionalImage(form: FormData): Promise<string | undefined> {
  const image = form.get("image");
  return image instanceof File && image.size > 0 ? saveImage(image, "group") : undefined;
}

export async function createGroupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const slug = formString(form, "slug").toLowerCase();
  try {
    await createGroup(getDb(), user.id, {
      title: formString(form, "title"),
      slug,
      description: formString(form, "description"),
      imagePath: await optionalImage(form),
    });
  } catch (err) {
    return failure(err);
  }
  redirect(`/g/${slug}`);
}

export async function updateGroupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const slug = slugOf(form);
    await updateGroup(getDb(), user.id, formId(form, "groupId"), {
      title: formString(form, "title"),
      description: formString(form, "description"),
      imagePath: await optionalImage(form),
    });
    revalidatePath(`/g/${slug}`, "layout");
    return { ok: "Group saved" };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteGroupAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await deleteGroup(getDb(), user.id, formId(form, "groupId"));
  redirect("/groups");
}

export async function joinGroupAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await joinGroup(getDb(), user.id, formId(form, "groupId"));
  revalidatePath(`/g/${slugOf(form)}`, "layout");
}

export async function leaveGroupAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await leaveGroup(getDb(), user.id, formId(form, "groupId"));
  revalidatePath(`/g/${slugOf(form)}`, "layout");
}

export async function shareWithGroupsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const groupIds = form.getAll("groupId").filter((v): v is string => typeof v === "string" && /^\d{1,15}$/.test(v)).map(Number);
    if (groupIds.length === 0) return { error: "Choose at least one group" };
    const entryId = formId(form, "entryId");
    const db = getDb();
    for (const groupId of groupIds) await shareEntryWithGroup(db, user.id, groupId, entryId, formString(form, "comment"));
    revalidatePath(`/e/${entryId}`);
    return { ok: `Shared with ${groupIds.length} ${groupIds.length === 1 ? "group" : "groups"}` };
  } catch (err) {
    return failure(err);
  }
}

export async function removeGroupEntryAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const slug = slugOf(form);
  await removeGroupEntry(getDb(), user.id, formId(form, "groupEntryId"));
  redirect(`/g/${slug}`);
}

export async function voteAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const value = formString(form, "value") === "down" ? -1 : 1;
  await vote(getDb(), user.id, formId(form, "groupEntryId"), value);
  revalidatePath(`/g/${slugOf(form)}`, "layout");
}

export async function addGroupCommentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const parent = formString(form, "parentId");
    await addGroupComment(getDb(), user.id, formId(form, "groupEntryId"), formString(form, "body"), parent ? formId(form, "parentId") : undefined);
    revalidatePath(`/g/${slugOf(form)}`, "layout");
    return {};
  } catch (err) {
    return failure(err);
  }
}

export async function deleteGroupCommentAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await deleteGroupComment(getDb(), user.id, formId(form, "commentId"));
  revalidatePath(`/g/${slugOf(form)}`, "layout");
}

export async function addGroupFeedAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const groupId = formId(form, "groupId");
    const db = getDb();
    await requireRole(db, user.id, groupId, "owner");
    const url = formString(form, "url");
    if (!url) throw new ValidationError("Enter a feed or site address");
    // The owner subscribes too, so the feed exists and is kept fresh.
    const { feedId, created } = await subscribeToUrl(db, user.id, { url, tags: [] });
    if (created) await harvestFeed(db, feedId);
    await addGroupFeed(db, user.id, groupId, feedId);
    revalidatePath(`/g/${slugOf(form)}`, "layout");
    return { ok: "Feed added" };
  } catch (err) {
    return failure(err);
  }
}

export async function removeGroupFeedAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await removeGroupFeed(getDb(), user.id, formId(form, "groupId"), formId(form, "feedId"));
  revalidatePath(`/g/${slugOf(form)}`, "layout");
}

export async function addGroupLinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await addGroupLink(getDb(), user.id, formId(form, "groupId"), { url: formString(form, "url"), title: formString(form, "title") });
    revalidatePath(`/g/${slugOf(form)}`, "layout");
    return { ok: "Link pinned" };
  } catch (err) {
    return failure(err);
  }
}

export async function removeGroupLinkAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await removeGroupLink(getDb(), user.id, formId(form, "groupId"), formId(form, "linkId"));
  revalidatePath(`/g/${slugOf(form)}`, "layout");
}

/** Moves a pinned link one place earlier. */
export async function moveGroupLinkUpAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const groupId = formId(form, "groupId");
  const linkId = formId(form, "linkId");
  const ids = (await listGroupLinks(db, groupId)).map((l) => l.id);
  const index = ids.indexOf(linkId);
  if (index > 0) {
    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
    await reorderGroupLinks(db, user.id, groupId, ids);
  }
  revalidatePath(`/g/${slugOf(form)}`, "layout");
}
