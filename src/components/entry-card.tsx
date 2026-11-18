import Link from "next/link";
import type { ReactNode } from "react";
import type { EntryListItem } from "@/domain/entries/query";
import { tagsToPath } from "@/lib/tags";
import { timeAgo } from "@/lib/time";
import { TagList } from "./ui";

export function EntryCard({
  entry,
  read = false,
  meta,
  actions,
  tagHref = (tag) => `/tags/${tagsToPath([tag])}`,
}: {
  entry: EntryListItem;
  read?: boolean;
  /** Extra line under the title, e.g. who shared it. */
  meta?: ReactNode;
  actions?: ReactNode;
  tagHref?: (tag: string) => string;
}) {
  return (
    <article className={`card ${read ? "opacity-60" : ""}`}>
      <h3 className="font-semibold leading-snug">
        <Link href={`/e/${entry.id}`} className="hover:text-accent">{entry.title}</Link>
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        <Link href={`/feeds/${entry.feedId}`} className="hover:underline">{entry.feedTitle || "Untitled feed"}</Link>
        {" · "}
        <time dateTime={entry.publishedAt.toISOString()}>{timeAgo(entry.publishedAt)}</time>
        {entry.url && (
          <>
            {" · "}
            <a href={entry.url} target="_blank" rel="noopener nofollow ugc" className="hover:underline">original ↗</a>
          </>
        )}
      </p>
      {meta && <div className="mt-1 text-xs text-muted">{meta}</div>}
      {entry.summary && <p className="mt-2 text-sm text-ink/90">{entry.summary}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <TagList tags={entry.tags} hrefFor={tagHref} />
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </article>
  );
}

export function EntryList({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
