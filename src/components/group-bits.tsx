import Link from "next/link";
import { Tabs } from "./ui";

export function GroupImage({ path, title, size = 48 }: { path: string | null; title: string; size?: number }) {
  const style = { width: size, height: size };
  if (path) {
    // eslint-disable-next-line @next/next/no-img-element -- served from our own /uploads route
    return <img src={`/${path}`} alt="" style={style} className="shrink-0 rounded-lg object-cover" />;
  }
  return (
    <span style={{ ...style, fontSize: size * 0.42 }} aria-hidden className="flex shrink-0 items-center justify-center rounded-lg bg-accent-soft font-semibold uppercase text-accent">
      {title.slice(0, 1)}
    </span>
  );
}

export function GroupTabs({ slug, active, isOwner }: { slug: string; active: string; isOwner: boolean }) {
  const base = `/g/${slug}`;
  return (
    <Tabs
      active={active}
      tabs={[
        { key: "latest", label: "Latest", href: base },
        { key: "popular", label: "Popular", href: `${base}/popular` },
        { key: "feeds", label: "From our feeds", href: `${base}/feeds` },
        { key: "members", label: "Members", href: `${base}/members` },
        ...(isOwner ? [{ key: "settings", label: "Settings", href: `${base}/settings` }] : []),
      ]}
    />
  );
}

/** Up and down vote buttons with the current score. Plain forms: they work without JavaScript. */
export function VoteButtons({
  action,
  slug,
  groupEntryId,
  score,
  myVote,
  canVote,
}: {
  action: (form: FormData) => Promise<void>;
  slug: string;
  groupEntryId: number;
  score: number;
  myVote: 1 | -1 | 0;
  canVote: boolean;
}) {
  const button = (value: "up" | "down", label: string, symbol: string, on: boolean) => (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="groupEntryId" value={groupEntryId} />
      <input type="hidden" name="value" value={value} />
      <button type="submit" disabled={!canVote} aria-label={label} aria-pressed={on} className={`btn px-2 py-0.5 ${on ? "btn-primary" : ""}`}>
        {symbol}
      </button>
    </form>
  );
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-1" role="group" aria-label="Vote">
      {button("up", "Vote up", "▲", myVote === 1)}
      <span className="text-sm font-semibold" aria-label={`Score ${score}`}>{score}</span>
      {button("down", "Vote down", "▼", myVote === -1)}
    </div>
  );
}

export function GroupEntryMeta({ slug, groupEntryId, sharedBy, comment, commentCount }: {
  slug: string; groupEntryId: number; sharedBy: { handle: string; displayName: string }; comment: string; commentCount: number;
}) {
  return (
    <>
      Shared by <Link href={`/u/${sharedBy.handle}`} className="link">{sharedBy.displayName}</Link>
      {comment && <>: “{comment}”</>}
      {" · "}
      <Link href={`/g/${slug}/e/${groupEntryId}`} className="link">
        {commentCount} {commentCount === 1 ? "comment" : "comments"}
      </Link>
    </>
  );
}
