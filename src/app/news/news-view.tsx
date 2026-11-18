import Link from "next/link";
import { EntryCard, EntryList } from "@/components/entry-card";
import { Empty, TagCloud, TagFilter } from "@/components/ui";
import { getDb } from "@/db/client";
import { PAGE_SIZE } from "@/domain/entries/query";
import { listUpcomingEvents } from "@/domain/events/repo";
import { listNews, newsTagCloud, type NewsCursor } from "@/domain/news/repo";
import { getProfileByUserId } from "@/domain/people/profiles";
import { firstParam, queryString, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { tagsToPath } from "@/lib/tags";
import { markAllReadAction, markReadAction } from "./actions";
import { EventsPanel } from "./events-panel";
import { NewsTabs } from "./news-tabs";

function parseCursor(raw: string | undefined): NewsCursor | undefined {
  const match = /^(\d{1,15})-(\d{1,15})$/.exec(raw ?? "");
  if (!match) return undefined;
  return { publishedAt: new Date(Number(match[1])), id: Number(match[2]) };
}

export async function NewsView({ tags, searchParams }: { tags: string[]; searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const show = firstParam(sp.show) === "unread" ? "unread" : "all";
  const before = parseCursor(firstParam(sp.before));
  const db = getDb();
  const [items, cloud, profile, events] = await Promise.all([
    listNews(db, user.id, { tags, unreadOnly: show === "unread", before }),
    newsTagCloud(db, user.id),
    getProfileByUserId(db, user.id),
    listUpcomingEvents(db, user.id, { limit: 8 }),
  ]);
  const path = (t: string[]) => (t.length > 0 ? `/news/tagged/${tagsToPath(t)}` : "/news");
  const href = (over: { show?: string; tags?: string[]; before?: string }) =>
    `${path(over.tags ?? tags)}${queryString({ show: (over.show ?? show) === "unread" ? "unread" : undefined, before: over.before })}`;
  const last = items[items.length - 1];
  const rssHref = `/news.rss${queryString({ key: profile?.feed_key, tags: tags.length > 0 ? tagsToPath(tags) : undefined })}`;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="h1">My News</h1>
          <form action={markAllReadAction}>
            {tags.map((t) => (
              <input key={t} type="hidden" name="tag" value={t} />
            ))}
            <button type="submit" className="btn">Mark all read</button>
          </form>
        </div>
        <NewsTabs active={show} allHref={href({ show: "all" })} unreadHref={href({ show: "unread" })} />
        <TagFilter tags={tags} hrefWithout={(t) => href({ tags: tags.filter((x) => x !== t) })} />
        {items.length === 0 ? (
          <Empty>
            {tags.length > 0 || show === "unread" || before ? (
              "Nothing matches."
            ) : (
              <>
                Nothing here yet. <Link href="/feeds/add" className="link">Add a feed</Link> or{" "}
                <Link href="/feeds" className="link">browse what others read</Link>.
              </>
            )}
          </Empty>
        ) : (
          <EntryList>
            {items.map((item) => (
              <EntryCard
                key={item.id}
                entry={item}
                read={item.read}
                tagHref={(t) => href({ tags: [...new Set([...tags, t])] })}
                actions={
                  !item.read && (
                    <form action={markReadAction}>
                      <input type="hidden" name="entryId" value={item.id} />
                      <button type="submit" className="btn btn-quiet" aria-label={`Mark "${item.title}" read`}>Mark read</button>
                    </form>
                  )
                }
              />
            ))}
          </EntryList>
        )}
        {items.length >= PAGE_SIZE && last && (
          <nav aria-label="Pages" className="mt-6 text-right text-sm">
            <Link className="link" href={href({ before: `${last.publishedAt.getTime()}-${last.id}` })}>Older →</Link>
          </nav>
        )}
      </div>
      <aside className="space-y-4">
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold">Tags in my news</h2>
          {cloud.length === 0 ? (
            <p className="text-xs text-muted">Tags from your feeds and entries will show up here.</p>
          ) : (
            <TagCloud tags={cloud} hrefFor={(t) => href({ tags: [...new Set([...tags, t])] })} />
          )}
        </section>
        <EventsPanel events={events} calendarHref={`/calendar.ics${queryString({ key: profile?.feed_key })}`} />
        <section className="card space-y-1 text-sm">
          <h2 className="mb-1 text-sm font-semibold">Take it with you</h2>
          <p><a className="link" href={rssHref}>This view as RSS</a></p>
          <p><a className="link" href="/opml">Export subscriptions (OPML)</a></p>
          <p><Link className="link" href="/feeds/import">Import OPML</Link></p>
          <p className="text-xs text-muted">The RSS link contains a private key. Share it only with your own feed reader.</p>
        </section>
      </aside>
    </div>
  );
}
