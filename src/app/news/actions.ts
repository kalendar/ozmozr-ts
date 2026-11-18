"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { markAllRead, markRead } from "@/domain/news/repo";
import { setEntryTags } from "@/domain/tags/repo";
import { failure, formId, formString, type FormState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { normalizeTags, parseTagInput } from "@/lib/tags";

export async function markReadAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await markRead(getDb(), user.id, [formId(form, "entryId")]);
  revalidatePath("/news", "layout");
}

export async function markAllReadAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const tags = normalizeTags(form.getAll("tag").filter((t): t is string => typeof t === "string"));
  await markAllRead(getDb(), user.id, tags.length > 0 ? tags : undefined);
  revalidatePath("/news", "layout");
}

export async function setEntryTagsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const entryId = formId(form, "entryId");
    await setEntryTags(getDb(), user.id, entryId, parseTagInput(formString(form, "tags")));
    revalidatePath(`/e/${entryId}`);
    return { ok: "Tags saved" };
  } catch (err) {
    return failure(err);
  }
}
