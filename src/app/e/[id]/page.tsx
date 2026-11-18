import Link from "next/link";
import { notFound } from "next/navigation";
import { TagList } from "@/components/ui";
import { getDb } from "@/db/client";
import { getEntry } from "@/domain/entries/query";
import { TagEditor } from "@/components/tag-editor";
import { setEntryTagsAction } from "@/app/news/actions";
import { markRead } from "@/domain/news/repo";
import { getMyEntryTags, suggestTags } from "@/domain/tags/repo";
import { shareWithFriendsAction } from "@/app/people/actions";
import { unsaveAction } from "@/app/save/actions";
import { ShareForm } from "@/components/share-form";
import { listFriends } from "@/domain/people/friends";
import { listMySharesOfEntry } from "@/domain/people/shares";
import { getSave } from "@/domain/bookmarks/repo";
import { idParam, queryString } from "@/lib/params";
import { getUser } from "@/lib/session";
import { formatTagInput, tagsToPath } from "@/lib/tags";
import { timeAgo } from "@/lib/time";

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const entryId = idParam((await params).id);
  if (entryId === null) notFound();
  const db = getDb();
  const entry = await getEntry(db, entryId);
  if (!entry) notFound();
  const user = await getUser();
  const save = user ? await getSave(db, user.id, entryId) : null;
  const sharing = user ? await Promise.all([listFriends(db, user.id), listMySharesOfEntry(db, user.id, entryId)]) : null;
  const mine = user
    ? await Promise.all([getMyEntryTags(db, user.id, entryId), suggestTags(db, user.id, entryId), markRead(db, user.id, [entryId])])
    : null;

  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="h1">{entry.title}</h1>
      <p className="mt-1 text-sm text-muted">
        <Link href={`/feeds/${entry.feedId}`} className="link">{entry.feedTitle || "Untitled feed"}</Link>
        {entry.author && <> · {entry.author}</>}
        {" · "}
        <time dateTime={entry.publishedAt.toISOString()}>{timeAgo(entry.publishedAt)}</time>
      </p>
      <div className="mt-3">
        <TagList tags={entry.tags} hrefFor={(t) => `/tags/${tagsToPath([t])}`} />
      </div>
      {/* content_html is sanitised when it is stored (see lib/sanitize). */}
      <div className="prose-entry mt-5" dangerouslySetInnerHTML={{ __html: entry.contentHtml || `<p>${entry.summary}</p>` }} />
      {entry.url && (
        <p className="mt-6">
          <a href={entry.url} target="_blank" rel="noopener nofollow ugc" className="btn">Read the original ↗</a>
          {user && !save && (
            <Link href={`/save${queryString({ u: entry.url, t: entry.title })}`} className="btn ml-2">Save</Link>
          )}
        </p>
      )}
      {save && (
        <section className="card mt-8 text-sm">
          <p className="font-semibold">You saved this {timeAgo(save.createdAt)} ago</p>
          {save.comment && <p className="mt-1 whitespace-pre-wrap text-muted">{save.comment}</p>}
          <form action={unsaveAction} className="mt-2">
            <input type="hidden" name="entryId" value={entryId} />
            <button type="submit" className="btn btn-danger">Remove from saved</button>
          </form>
        </section>
      )}
      {mine && (
        <section className="card mt-8">
          <TagEditor
            action={setEntryTagsAction}
            hidden={{ entryId }}
            initial={formatTagInput(mine[0])}
            suggestions={[
              { label: "Popular here:", tags: mine[1].popular },
              { label: "You often use:", tags: mine[1].mine },
            ]}
          />
        </section>
      )}
      {sharing && (
        <section className="card mt-4" aria-labelledby="share-friends">
          <h2 id="share-friends" className="mb-2 text-sm font-semibold">Share with friends</h2>
          <ShareForm
            action={shareWithFriendsAction}
            entryId={entryId}
            legend="Friends"
            name="friendId"
            options={sharing[0].map((f) => ({ value: f.userId, label: f.displayName }))}
            already={sharing[1]}
            submitLabel="Share"
            emptyText="Add friends to share entries with them."
          />
        </section>
      )}
    </article>
  );
}
