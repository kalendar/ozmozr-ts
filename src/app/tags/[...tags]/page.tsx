import Link from "next/link";
import { EntryCard, EntryList } from "@/components/entry-card";
import { Empty, Pager, TagFilter } from "@/components/ui";
import { getDb } from "@/db/client";
import { listEntriesByTags } from "@/domain/search/repo";
import { pageParam, queryString, type SearchParams } from "@/lib/params";
import { pathToTags, tagsToPath } from "@/lib/tags";

export async function generateMetadata({ params }: { params: Promise<{ tags: string[] }> }) {
  return { title: `Tagged ${pathToTags((await params).tags).join(" + ")}` };
}

export default async function TagPage({ params, searchParams }: { params: Promise<{ tags: string[] }>; searchParams: SearchParams }) {
  const tags = pathToTags((await params).tags);
  const page = pageParam((await searchParams).page);
  const entries = await listEntriesByTags(getDb(), tags, { page });
  const path = (t: string[]) => (t.length > 0 ? `/tags/${tagsToPath(t)}` : "/tags");

  return (
    <div className="max-w-3xl">
      <h1 className="h1 mb-1">Tagged</h1>
      <p className="mb-4 text-sm text-muted">
        Entries from every feed and everyone&apos;s saved links. <Link href="/tags" className="link">All tags</Link>
      </p>
      <TagFilter tags={tags} hrefWithout={(t) => path(tags.filter((x) => x !== t))} />
      {entries.length === 0 ? (
        <Empty>Nothing carries {tags.length > 1 ? "all of these tags" : "this tag"} yet.</Empty>
      ) : (
        <EntryList>
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} tagHref={(t) => path([...new Set([...tags, t])])} />
          ))}
        </EntryList>
      )}
      <Pager page={page} count={entries.length} hrefFor={(p) => `${path(tags)}${queryString({ page: p })}`} />
    </div>
  );
}
