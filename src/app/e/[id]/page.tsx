import Link from "next/link";
import { notFound } from "next/navigation";
import { TagList } from "@/components/ui";
import { getDb } from "@/db/client";
import { getEntry } from "@/domain/entries/query";
import { idParam } from "@/lib/params";
import { tagsToPath } from "@/lib/tags";
import { timeAgo } from "@/lib/time";

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const entryId = idParam((await params).id);
  if (entryId === null) notFound();
  const entry = await getEntry(getDb(), entryId);
  if (!entry) notFound();

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
        </p>
      )}
    </article>
  );
}
