import { notFound, redirect } from "next/navigation";
import { EntryCard, EntryList } from "@/components/entry-card";
import { ActionForm, SubmitButton } from "@/components/form";
import { TagInput } from "@/components/tag-input";
import { Empty, Pager, TagFilter } from "@/components/ui";
import { getDb } from "@/db/client";
import { getFeed, getSubscription, listFeedEntries } from "@/domain/feeds/repo";
import { getBookmarkFeedOwnerHandle } from "@/domain/people/profiles";
import { idParam, pageParam, queryString, tagParams, type SearchParams } from "@/lib/params";
import { getUser } from "@/lib/session";
import { formatTagInput } from "@/lib/tags";
import { subscribeAction, unsubscribeAction, updateSubscriptionTags } from "../actions";

export default async function FeedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const feedId = idParam((await params).id);
  if (feedId === null) notFound();
  const sp = await searchParams;
  const user = await getUser();
  const db = getDb();
  const feed = await getFeed(db, feedId, user?.id);
  if (!feed) {
    // A personal saved-links feed has no page of its own: show its owner instead.
    const owner = await getBookmarkFeedOwnerHandle(db, feedId);
    if (owner) redirect(`/u/${owner}`);
    notFound();
  }
  const tags = tagParams(sp.tag);
  const page = pageParam(sp.page);
  const [entries, subscription] = await Promise.all([
    listFeedEntries(db, feedId, { tags, page }),
    user ? getSubscription(db, user.id, feedId) : null,
  ]);
  const href = (over: { page?: number; tag?: string[] }) =>
    `/feeds/${feedId}${queryString({ tag: over.tag ?? tags, page: over.page })}`;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
      <div>
        <h1 className="h1">{subscription?.title || feed.title || feed.url}</h1>
        {feed.description && <p className="mt-1 text-sm text-muted">{feed.description}</p>}
        <p className="mb-4 mt-2 text-xs text-muted">
          {feed.subscriberCount} {feed.subscriberCount === 1 ? "subscriber" : "subscribers"}
          {feed.siteUrl && (
            <>
              {" · "}
              <a href={feed.siteUrl} target="_blank" rel="noopener nofollow ugc" className="link">Visit site ↗</a>
            </>
          )}
        </p>
        {feed.lastError && (
          <p className="notice notice-error mb-4">This feed could not be refreshed last time: {feed.lastError}</p>
        )}
        <TagFilter tags={tags} hrefWithout={(t) => href({ tag: tags.filter((x) => x !== t) })} />
        {entries.length === 0 ? (
          <Empty>No entries yet. New feeds are fetched within a minute or two.</Empty>
        ) : (
          <EntryList>
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} tagHref={(t) => href({ tag: [...new Set([...tags, t])] })} />
            ))}
          </EntryList>
        )}
        <Pager page={page} count={entries.length} hrefFor={(p) => href({ page: p })} />
      </div>
      <aside className="space-y-4">
        {user && (
          <div className="card space-y-3">
            {feed.subscribed ? (
              <>
                <ActionForm action={updateSubscriptionTags} className="space-y-3">
                  <input type="hidden" name="feedId" value={feedId} />
                  <TagInput label="Your tags for this feed" defaultValue={formatTagInput(subscription?.tags ?? [])} />
                  <SubmitButton className="btn">Save tags</SubmitButton>
                </ActionForm>
                <form action={unsubscribeAction}>
                  <input type="hidden" name="feedId" value={feedId} />
                  <button type="submit" className="btn btn-danger w-full">Unsubscribe</button>
                </form>
              </>
            ) : (
              <form action={subscribeAction}>
                <input type="hidden" name="feedId" value={feedId} />
                <button type="submit" className="btn btn-primary w-full">Subscribe</button>
              </form>
            )}
          </div>
        )}
        <p className="break-all text-xs text-muted">Feed address: {feed.url}</p>
      </aside>
    </div>
  );
}
