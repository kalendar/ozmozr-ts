import Link from "next/link";
import { PersonCard } from "@/components/person-card";
import { TagEditor } from "@/components/tag-editor";
import { Empty, TagCloud, TagFilter } from "@/components/ui";
import { getDb } from "@/db/client";
import { friendTagCloud, getFriendTags, listFriends, listPendingRequests, listSentRequests } from "@/domain/people/friends";
import { queryString, tagParams, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { formatTagInput } from "@/lib/tags";
import { removeFriendAction, respondAction, setFriendTagsAction } from "../people/actions";

export const metadata = { title: "Friends" };

export default async function FriendsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const tags = tagParams((await searchParams).tag);
  const db = getDb();
  const [friends, incoming, sent, cloud] = await Promise.all([
    listFriends(db, user.id, { tags }),
    listPendingRequests(db, user.id),
    listSentRequests(db, user.id),
    friendTagCloud(db, user.id),
  ]);
  const friendTags = await Promise.all(friends.map((f) => getFriendTags(db, user.id, f.userId)));
  const href = (t: string[]) => `/friends${queryString({ tag: t })}`;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
      <div>
        <h1 className="h1 mb-4">Friends</h1>
        {incoming.length > 0 && (
          <section className="mb-8" aria-labelledby="requests">
            <h2 id="requests" className="h2 mb-3">Friend requests</h2>
            <ul className="space-y-3">
              {incoming.map((person) => (
                <li key={person.userId}>
                  <PersonCard
                    person={person}
                    actions={
                      <>
                        <form action={respondAction}>
                          <input type="hidden" name="userId" value={person.userId} />
                          <input type="hidden" name="accept" value="yes" />
                          <button type="submit" className="btn btn-primary">Accept</button>
                        </form>
                        <form action={respondAction}>
                          <input type="hidden" name="userId" value={person.userId} />
                          <input type="hidden" name="accept" value="no" />
                          <button type="submit" className="btn">Decline</button>
                        </form>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        <TagFilter tags={tags} hrefWithout={(t) => href(tags.filter((x) => x !== t))} />
        {friends.length === 0 ? (
          <Empty>
            {tags.length > 0 ? "No friends carry those tags." : <>No friends yet. Find people in the <Link href="/people" className="link">directory</Link>.</>}
          </Empty>
        ) : (
          <ul className="space-y-3">
            {friends.map((person, i) => (
              <li key={person.userId} className="space-y-2">
                <PersonCard
                  person={person}
                  actions={
                    <form action={removeFriendAction}>
                      <input type="hidden" name="userId" value={person.userId} />
                      <button type="submit" className="btn btn-quiet">Remove</button>
                    </form>
                  }
                />
                <details className="ml-12 text-sm">
                  <summary className="cursor-pointer text-muted">
                    Tags: {friendTags[i]!.length > 0 ? friendTags[i]!.join(", ") : "none"} (edit)
                  </summary>
                  <div className="mt-2">
                    <TagEditor
                      action={setFriendTagsAction}
                      hidden={{ userId: person.userId }}
                      initial={formatTagInput(friendTags[i]!)}
                      suggestions={[]}
                      label={`Your tags for ${person.displayName}`}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        {sent.length > 0 && (
          <section className="mt-8">
            <h2 className="h2 mb-3">Waiting for an answer</h2>
            <ul className="space-y-3">
              {sent.map((person) => (
                <li key={person.userId}>
                  <PersonCard
                    person={person}
                    actions={
                      <form action={removeFriendAction}>
                        <input type="hidden" name="userId" value={person.userId} />
                        <button type="submit" className="btn btn-quiet">Cancel request</button>
                      </form>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <aside>
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold">Your tags for friends</h2>
          {cloud.length === 0 ? (
            <p className="text-xs text-muted">Tag friends to group them, for example “work” or “family”.</p>
          ) : (
            <TagCloud tags={cloud} hrefFor={(t) => href([...new Set([...tags, t])])} />
          )}
        </section>
      </aside>
    </div>
  );
}
