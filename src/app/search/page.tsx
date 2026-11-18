import Link from "next/link";
import { EntryCard, EntryList } from "@/components/entry-card";
import { PersonCard } from "@/components/person-card";
import { Empty, Pager, Tabs } from "@/components/ui";
import { getDb } from "@/db/client";
import { search, type SearchType } from "@/domain/search/repo";
import { firstParam, pageParam, queryString, type SearchParams } from "@/lib/params";

export const metadata = { title: "Search" };

const TYPES: SearchType[] = ["entries", "feeds", "people", "groups"];

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = (firstParam(sp.q) ?? "").slice(0, 200);
  const typeParam = firstParam(sp.type) as SearchType | undefined;
  const type: SearchType = typeParam && TYPES.includes(typeParam) ? typeParam : "entries";
  const page = pageParam(sp.page);
  const result = await search(getDb(), q, { type, page });
  const href = (over: { type?: string; page?: number }) => `/search${queryString({ q, type: over.type ?? type, page: over.page })}`;

  return (
    <div className="max-w-3xl">
      <h1 className="h1 mb-4">Search</h1>
      <form action="/search" className="mb-4 flex gap-2">
        <input type="hidden" name="type" value={type} />
        <input name="q" type="search" defaultValue={q} aria-label="Search for" className="input" placeholder='Try "open education" -spam' />
        <button type="submit" className="btn btn-primary">Search</button>
      </form>
      <Tabs
        active={type}
        tabs={[
          { key: "entries", label: "Entries", href: href({ type: "entries" }) },
          { key: "feeds", label: "Feeds", href: href({ type: "feeds" }) },
          { key: "people", label: "People", href: href({ type: "people" }) },
          { key: "groups", label: "Groups", href: href({ type: "groups" }) },
        ]}
      />
      {result.items.length === 0 ? (
        <Empty>{q ? `Nothing found for “${q}”.` : "Type something to search for."}</Empty>
      ) : result.type === "entries" ? (
        <EntryList>
          {result.items.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </EntryList>
      ) : result.type === "feeds" ? (
        <ul className="space-y-3">
          {result.items.map((feed) => (
            <li key={feed.id} className="card">
              <Link href={`/feeds/${feed.id}`} className="font-semibold hover:text-accent">{feed.title || feed.url}</Link>
              {feed.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{feed.description}</p>}
              <p className="mt-1 text-xs text-muted">{feed.subscriberCount} subscribers</p>
            </li>
          ))}
        </ul>
      ) : result.type === "people" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {result.items.map((person) => (
            <li key={person.userId}><PersonCard person={person} /></li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {result.items.map((group) => (
            <li key={group.id} className="card">
              <Link href={`/g/${group.slug}`} className="font-semibold hover:text-accent">{group.title}</Link>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{group.description}</p>
              <p className="mt-1 text-xs text-muted">{group.memberCount} members</p>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} count={result.items.length} hrefFor={(p) => href({ page: p })} />
    </div>
  );
}
