"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { harvestFeed } from "@/domain/feeds/harvest";
import { importOpml } from "@/domain/feeds/opml";
import { setSubscriptionTags, subscribeToFeed, subscribeToUrl, unsubscribe } from "@/domain/feeds/repo";
import { failure, formId, formString, type FormState } from "@/lib/action";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { parseTagInput } from "@/lib/tags";

export async function addFeed(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let feedId: number;
  try {
    const url = formString(form, "url");
    if (!url) throw new ValidationError("Enter a web address");
    if (url.length > 2000) throw new ValidationError("That address is too long");
    const db = getDb();
    const result = await subscribeToUrl(db, user.id, {
      url,
      title: formString(form, "title"),
      tags: parseTagInput(formString(form, "tags")),
    });
    feedId = result.feedId;
    // Fetch a brand-new feed straight away so the person sees its entries.
    if (result.created) await harvestFeed(db, feedId);
  } catch (err) {
    return failure(err);
  }
  redirect(`/feeds/${feedId}`);
}

export async function subscribeAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const feedId = formId(form, "feedId");
  await subscribeToFeed(getDb(), user.id, feedId);
  revalidatePath(`/feeds/${feedId}`);
}

export async function unsubscribeAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const feedId = formId(form, "feedId");
  await unsubscribe(getDb(), user.id, feedId);
  revalidatePath(`/feeds/${feedId}`);
}

export async function updateSubscriptionTags(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const feedId = formId(form, "feedId");
    await setSubscriptionTags(getDb(), user.id, feedId, parseTagInput(formString(form, "tags")));
    revalidatePath(`/feeds/${feedId}`);
    return { ok: "Tags saved" };
  } catch (err) {
    return failure(err);
  }
}

export async function importOpmlAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Choose an OPML file");
    if (file.size > 2_000_000) throw new ValidationError("That file is larger than 2 MB");
    const result = await importOpml(getDb(), user.id, await file.text());
    revalidatePath("/feeds");
    const parts = [`Added ${result.added}`, `already subscribed to ${result.skipped}`];
    if (result.failed.length > 0) parts.push(`could not import ${result.failed.length} (${result.failed[0]!.reason.toLowerCase()})`);
    return { ok: `${parts.join(", ")}. New feeds are fetched over the next few minutes.` };
  } catch (err) {
    return failure(err);
  }
}
