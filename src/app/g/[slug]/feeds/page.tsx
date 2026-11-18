import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryCard, EntryList } from "@/components/entry-card";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { GroupTabs } from "@/components/group-bits";
import { Empty, Pager } from "@/components/ui";
import { getDb } from "@/db/client";
import { listGroupFeedEntries, listGroupFeeds } from "@/domain/groups/entries";
import { getGroupBySlug } from "@/domain/groups/repo";
import { pageParam, queryString, type SearchParams } from "@/lib/params";
import { getUser } from "@/lib/session";
import { addGroupFeedAction, removeGroupFeedAction } from "../../actions";

export default async function GroupFeedsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const user = await getUser();
  const db = getDb();
  const group = await getGroupBySlug(db, (await params).slug, user?.id);
  if (!group) notFound();
  const page = pageParam((await searchParams).page);
  const [feeds, entries] = await Promise.all([listGroupFeeds(db, group.id), listGroupFeedEntries(db, group.id, { page })]);
  const isOwner = group.role === "owner";

  return (
    <>
      <GroupTabs slug={group.slug} active="feeds" isOwner={isOwner} />
      <section className="card mb-4">
        <h2 className="mb-2 text-sm font-semibold">Feeds this group follows</h2>
        {feeds.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {feeds.map((feed) => (
              <li key={feed.id} className="flex items-center justify-between gap-2">
                <Link href={`/feeds/${feed.id}`} className="link">{feed.title || feed.url}</Link>
                {isOwner && (
                  <form action={removeGroupFeedAction}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="slug" value={group.slug} />
                    <input type="hidden" name="feedId" value={feed.id} />
                    <button type="submit" className="btn btn-quiet" aria-label={`Remove ${feed.title || feed.url}`}>Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {isOwner && (
          <ActionForm action={addGroupFeedAction} className="mt-4 space-y-3">
            <input type="hidden" name="groupId" value={group.id} />
            <input type="hidden" name="slug" value={group.slug} />
            <Field label="Add a feed" name="url" type="text" inputMode="url" required placeholder="https://example.org/feed.xml" />
            <SubmitButton className="btn">Add feed</SubmitButton>
          </ActionForm>
        )}
      </section>
      {entries.length === 0 ? (
        <Empty>No entries from the group&apos;s feeds yet.</Empty>
      ) : (
        <EntryList>
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </EntryList>
      )}
      <Pager page={page} count={entries.length} hrefFor={(p) => `/g/${group.slug}/feeds${queryString({ page: p })}`} />
    </>
  );
}
