import Link from "next/link";
import { EntryCard, EntryList } from "@/components/entry-card";
import { Empty, Pager } from "@/components/ui";
import { getDb } from "@/db/client";
import { listSharedWithMe } from "@/domain/people/shares";
import { pageParam, queryString, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { NewsTabs } from "../news-tabs";

export const metadata = { title: "Shared with me" };

export default async function SharedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const page = pageParam((await searchParams).page);
  const items = await listSharedWithMe(getDb(), user.id, { page });
  return (
    <div className="max-w-3xl">
      <h1 className="h1 mb-4">My News</h1>
      <NewsTabs active="shared" />
      {items.length === 0 ? (
        <Empty>Nothing has been shared with you yet. Friends can share entries with you from any entry page.</Empty>
      ) : (
        <EntryList>
          {items.map((item) => (
            <EntryCard
              key={`${item.id}-${item.sharedBy.userId}`}
              entry={item}
              meta={
                <>
                  Shared by <Link href={`/u/${item.sharedBy.handle}`} className="link">{item.sharedBy.displayName}</Link>
                  {item.comment && <>: “{item.comment}”</>}
                </>
              }
            />
          ))}
        </EntryList>
      )}
      <Pager page={page} count={items.length} hrefFor={(p) => `/news/shared${queryString({ page: p })}`} />
    </div>
  );
}
