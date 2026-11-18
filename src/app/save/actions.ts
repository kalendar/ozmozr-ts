"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { saveLink, unsaveLink } from "@/domain/bookmarks/repo";
import { extractEventsForEntry } from "@/domain/events/repo";
import { failure, formId, formString, type FormState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { parseTagInput } from "@/lib/tags";

export async function saveLinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let entryId: number;
  try {
    const result = await saveLink(getDb(), user.id, {
      url: formString(form, "url"),
      title: formString(form, "title"),
      comment: formString(form, "comment"),
      tags: parseTagInput(formString(form, "tags")),
    });
    entryId = result.entryId;
    // Look for events on a newly saved page. Bounded and failure-tolerant.
    if (result.created) await extractEventsForEntry(getDb(), entryId);
  } catch (err) {
    return failure(err);
  }
  redirect(`/e/${entryId}`);
}

export async function unsaveAction(form: FormData): Promise<void> {
  const user = await requireUser();
  await unsaveLink(getDb(), user.id, formId(form, "entryId"));
  redirect("/news/saved");
}
