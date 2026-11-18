import Link from "next/link";
import type { ReactNode } from "react";
import { PAGE_SIZE } from "@/domain/entries/query";

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <div role="tablist" className="mb-4 flex gap-4 border-b border-line">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} role="tab" aria-selected={t.key === active} className={`tab ${t.key === active ? "tab-active" : ""}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** Previous / next links. `hrefFor(page)` builds the URL for a page number. */
export function Pager({ page, count, hrefFor }: { page: number; count: number; hrefFor: (page: number) => string }) {
  if (page <= 1 && count < PAGE_SIZE) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex justify-between text-sm">
      {page > 1 ? <Link className="link" href={hrefFor(page - 1)}>← Newer</Link> : <span />}
      {count >= PAGE_SIZE ? <Link className="link" href={hrefFor(page + 1)}>Older →</Link> : <span />}
    </nav>
  );
}

export function TagList({ tags, hrefFor }: { tags: string[]; hrefFor: (tag: string) => string }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag}>
          <Link href={hrefFor(tag)} className="tag">{tag}</Link>
        </li>
      ))}
    </ul>
  );
}

/** Active tag filters with a link to drop each one. */
export function TagFilter({ tags, hrefWithout }: { tags: string[]; hrefWithout: (tag: string) => string }) {
  if (tags.length === 0) return null;
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Tagged</span>
      {tags.map((tag) => (
        <Link key={tag} href={hrefWithout(tag)} className="tag" aria-label={`Remove tag filter ${tag}`}>
          {tag} ✕
        </Link>
      ))}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="card text-sm text-muted">{children}</p>;
}

export function TagCloud({ tags, hrefFor }: { tags: { name: string; count: number }[]; hrefFor: (tag: string) => string }) {
  if (tags.length === 0) return null;
  const max = Math.max(...tags.map((t) => t.count));
  return (
    <ul className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1" aria-label="Tag cloud">
      {tags.map((t) => {
        const weight = max > 1 ? Math.log(t.count) / Math.log(max) : 0;
        return (
          <li key={t.name}>
            <Link href={hrefFor(t.name)} className="link" style={{ fontSize: `${0.8 + weight * 0.6}rem` }} title={`${t.count} uses`}>
              {t.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
