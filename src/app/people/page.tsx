import { PersonCard } from "@/components/person-card";
import { Empty, Pager, TagFilter, Tabs } from "@/components/ui";
import { getDb } from "@/db/client";
import { listPeople } from "@/domain/people/profiles";
import { firstParam, pageParam, queryString, tagParams, type SearchParams } from "@/lib/params";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const sort = firstParam(sp.sort) === "alpha" ? "alpha" : "new";
  const tags = tagParams(sp.tag);
  const page = pageParam(sp.page);
  const people = await listPeople(getDb(), { sort, tags, page });
  const href = (over: { sort?: string; page?: number; tag?: string[] }) =>
    `/people${queryString({ sort: over.sort ?? sort, tag: over.tag ?? tags, page: over.page })}`;
  return (
    <div>
      <h1 className="h1 mb-4">People</h1>
      <Tabs
        active={sort}
        tabs={[
          { key: "new", label: "Newest", href: href({ sort: "new" }) },
          { key: "alpha", label: "A–Z", href: href({ sort: "alpha" }) },
        ]}
      />
      <TagFilter tags={tags} hrefWithout={(t) => href({ tag: tags.filter((x) => x !== t) })} />
      {people.length === 0 ? (
        <Empty>Nobody here yet.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map((person) => (
            <li key={person.userId}><PersonCard person={person} /></li>
          ))}
        </ul>
      )}
      <Pager page={page} count={people.length} hrefFor={(p) => href({ page: p })} />
    </div>
  );
}
