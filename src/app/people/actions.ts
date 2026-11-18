"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { removeFriend, requestFriend, respondToRequest, setFriendTags } from "@/domain/people/friends";
import { addProfileComment, deleteProfileComment, setAvatar, updateProfile } from "@/domain/people/profiles";
import { shareEntryWithFriends } from "@/domain/people/shares";
import { failure, formId, formString, type FormState } from "@/lib/action";
import { enforceLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { saveImage } from "@/lib/storage";
import { parseTagInput } from "@/lib/tags";

export async function updateProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const db = getDb();
    await updateProfile(db, user.id, {
      displayName: formString(form, "displayName"),
      blurb: formString(form, "blurb"),
      location: formString(form, "location"),
      website: formString(form, "website"),
    });
    const avatar = form.get("avatar");
    if (avatar instanceof File && avatar.size > 0) await setAvatar(db, user.id, await saveImage(avatar, "avatar"));
    revalidatePath("/", "layout");
    return { ok: "Profile saved" };
  } catch (err) {
    return failure(err);
  }
}

export async function requestFriendAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await requestFriend(getDb(), user.id, formString(form, "userId"));
  revalidatePath("/", "layout");
}

export async function respondAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await respondToRequest(getDb(), user.id, formString(form, "userId"), formString(form, "accept") === "yes");
  revalidatePath("/", "layout");
}

export async function removeFriendAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await removeFriend(getDb(), user.id, formString(form, "userId"));
  revalidatePath("/", "layout");
}

export async function setFriendTagsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await setFriendTags(getDb(), user.id, formString(form, "userId"), parseTagInput(formString(form, "tags")));
    revalidatePath("/friends");
    return { ok: "Saved" };
  } catch (err) {
    return failure(err);
  }
}

export async function addProfileCommentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await enforceLimit("comment", user.id);
    await addProfileComment(getDb(), user.id, formString(form, "profileUserId"), formString(form, "body"));
    revalidatePath(`/u/${formString(form, "handle")}`);
    return {};
  } catch (err) {
    return failure(err);
  }
}

export async function deleteProfileCommentAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await deleteProfileComment(getDb(), user.id, formId(form, "commentId"));
  revalidatePath("/", "layout");
}

export async function shareWithFriendsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const friendIds = form.getAll("friendId").filter((v): v is string => typeof v === "string");
    if (friendIds.length === 0) return { error: "Choose at least one friend" };
    await shareEntryWithFriends(getDb(), user.id, formId(form, "entryId"), friendIds, formString(form, "comment"));
    return { ok: `Shared with ${friendIds.length} ${friendIds.length === 1 ? "friend" : "friends"}` };
  } catch (err) {
    return failure(err);
  }
}
