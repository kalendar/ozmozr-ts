import Link from "next/link";
import { Empty, Pager, TagFilter, Tabs } from "@/components/ui";
import { getDb } from "@/db/client";
import { listFeeds, type FeedSort } from "@/domain/feeds/repo";
import { firstParam, pageParam, queryString, tagParams, type SearchParams } from "@/lib/params";
import { getUser } from "@/lib/session";
import { timeAgo } from "@/lib/time";

export const metadata = { title: "Feeds" };

const SORTS: FeedSort[] = ["popular", "new", "alpha"];

export default async function FeedsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await getUser();
  const sortParam = firstParam(sp.sort) as FeedSort | undefined;
  const sort: FeedSort = sortParam && SORTS.includes(sortParam) ? sortParam : "popular";
  const tags = tagParams(sp.tag);
  const page = pageParam(sp.page);
  const feeds = await listFeeds(getDb(), { userId: user?.id, sort, tags, page });
  const href = (over: { sort?: string; page?: number; tag?: string[] }) =>
    `/feeds${queryString({ sort: over.sort ?? sort, tag: over.tag ?? tags, page: over.page })}`;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="h1">Feeds</h1>
        {user && <Link href="/feeds/add" className="btn btn-primary">Add a feed</Link>}
      </div>
      <Tabs
        active={sort}
        tabs={[
          { key: "popular", label: "Popular", href: href({ sort: "popular" }) },
          { key: "new", label: "New", href: href({ sort: "new" }) },
          { key: "alpha", label: "A–Z", href: href({ sort: "alpha" }) },
        ]}
      />
      <TagFilter tags={tags} hrefWithout={(t) => href({ tag: tags.filter((x) => x !== t) })} />
      {feeds.length === 0 ? (
        <Empty>No feeds here yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {feeds.map((feed) => (
            <li key={feed.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">
                  <Link href={`/feeds/${feed.id}`} className="hover:text-accent">{feed.title || feed.url}</Link>
                </h2>
                {feed.subscribed && <span className="tag shrink-0">Subscribed</span>}
              </div>
              {feed.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{feed.description}</p>}
              <p className="mt-2 text-xs text-muted">
                {feed.subscriberCount} {feed.subscriberCount === 1 ? "subscriber" : "subscribers"} · added {timeAgo(feed.createdAt)} ago
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} count={feeds.length} hrefFor={(p) => href({ page: p })} />
    </div>
  );
}
