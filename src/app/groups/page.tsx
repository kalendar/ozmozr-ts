import Link from "next/link";
import { GroupImage } from "@/components/group-bits";
import { Empty, Pager, Tabs } from "@/components/ui";
import { getDb } from "@/db/client";
import { listGroups } from "@/domain/groups/repo";
import { firstParam, pageParam, queryString, type SearchParams } from "@/lib/params";
import { getUser } from "@/lib/session";

export const metadata = { title: "Groups" };

const SORTS = ["popular", "new", "alpha", "mine"] as const;
type Sort = (typeof SORTS)[number];

export default async function GroupsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await getUser();
  const raw = firstParam(sp.sort) as Sort | undefined;
  const sort: Sort = raw && SORTS.includes(raw) ? raw : "popular";
  const page = pageParam(sp.page);
  const groups = await listGroups(getDb(), {
    userId: user?.id,
    sort: sort === "mine" ? "alpha" : sort,
    mine: sort === "mine",
    page,
  });
  const href = (over: { sort?: string; page?: number }) => `/groups${queryString({ sort: over.sort ?? sort, page: over.page })}`;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="h1">Groups</h1>
        {user && <Link href="/groups/new" className="btn btn-primary">Start a group</Link>}
      </div>
      <Tabs
        active={sort}
        tabs={[
          { key: "popular", label: "Popular", href: href({ sort: "popular" }) },
          { key: "new", label: "New", href: href({ sort: "new" }) },
          { key: "alpha", label: "A–Z", href: href({ sort: "alpha" }) },
          ...(user ? [{ key: "mine", label: "My groups", href: href({ sort: "mine" }) }] : []),
        ]}
      />
      {groups.length === 0 ? (
        <Empty>{sort === "mine" ? "You have not joined any groups yet." : "No groups yet. Start the first one."}</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id} className="card flex items-start gap-3">
              <GroupImage path={group.imagePath} title={group.title} />
              <div className="min-w-0">
                <Link href={`/g/${group.slug}`} className="font-semibold hover:text-accent">{group.title}</Link>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted">{group.description}</p>
                <p className="mt-1 text-xs text-muted">{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} count={groups.length} hrefFor={(p) => href({ page: p })} />
    </div>
  );
}
