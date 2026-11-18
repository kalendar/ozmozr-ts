import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryCard } from "@/components/entry-card";
import { GroupEntryMeta, GroupTabs, VoteButtons } from "@/components/group-bits";
import { Empty, Pager, TagCloud, TagFilter } from "@/components/ui";
import { getDb } from "@/db/client";
import { groupTagCloud, listGroupEntries } from "@/domain/groups/entries";
import { getGroupBySlug } from "@/domain/groups/repo";
import { pageParam, queryString, tagParams, type SearchParams } from "@/lib/params";
import { getUser } from "@/lib/session";
import { voteAction } from "../actions";

/** The Latest and Popular tabs of a group: entries members shared, with votes. */
export async function SharedList({ slug, sort, searchParams }: { slug: string; sort: "latest" | "popular"; searchParams: SearchParams }) {
  const user = await getUser();
  const db = getDb();
  const group = await getGroupBySlug(db, slug, user?.id);
  if (!group) notFound();
  const sp = await searchParams;
  const tags = tagParams(sp.tag);
  const page = pageParam(sp.page);
  const [items, cloud] = await Promise.all([
    listGroupEntries(db, group.id, { userId: user?.id, sort, tags, page }),
    groupTagCloud(db, group.id),
  ]);
  const base = sort === "popular" ? `/g/${group.slug}/popular` : `/g/${group.slug}`;
  const href = (over: { tag?: string[]; page?: number }) => `${base}${queryString({ tag: over.tag ?? tags, page: over.page })}`;

  return (
    <>
      <GroupTabs slug={group.slug} active={sort} isOwner={group.role === "owner"} />
      <TagFilter tags={tags} hrefWithout={(t) => href({ tag: tags.filter((x) => x !== t) })} />
      {items.length === 0 ? (
        <Empty>
          {sort === "popular"
            ? "Nothing has been shared in the last 30 days."
            : <>Nothing shared yet. Members can share any entry from its page, or <Link href="/save" className="link">save a link</Link> and share that.</>}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.groupEntryId} className="flex gap-3">
              <VoteButtons action={voteAction} slug={group.slug} groupEntryId={item.groupEntryId} score={item.score} myVote={item.myVote} canVote={group.role !== null} />
              <div className="min-w-0 flex-1">
                <EntryCard
                  entry={item}
                  tagHref={(t) => href({ tag: [...new Set([...tags, t])] })}
                  meta={<GroupEntryMeta slug={group.slug} groupEntryId={item.groupEntryId} sharedBy={item.sharedBy} comment={item.comment} commentCount={item.commentCount} />}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} count={items.length} hrefFor={(p) => href({ page: p })} />
      {cloud.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-2 text-sm font-semibold">Tags in this group</h2>
          <TagCloud tags={cloud} hrefFor={(t) => href({ tag: [...new Set([...tags, t])] })} />
        </section>
      )}
    </>
  );
}
