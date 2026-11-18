import Link from "next/link";
import { EntryCard, EntryList } from "@/components/entry-card";
import { Empty, Pager } from "@/components/ui";
import { getDb } from "@/db/client";
import { listSaved } from "@/domain/bookmarks/repo";
import { pageParam, queryString, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { NewsTabs } from "../news-tabs";

export const metadata = { title: "Saved links" };

export default async function SavedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const page = pageParam((await searchParams).page);
  const entries = await listSaved(getDb(), user.id, { page });
  return (
    <div className="max-w-3xl">
      <h1 className="h1 mb-4">My News</h1>
      <NewsTabs active="saved" />
      {entries.length === 0 ? (
        <Empty>
          Nothing saved yet. <Link href="/save" className="link">Save a link</Link>.
        </Empty>
      ) : (
        <EntryList>
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </EntryList>
      )}
      <Pager page={page} count={entries.length} hrefFor={(p) => `/news/saved${queryString({ page: p })}`} />
    </div>
  );
}
