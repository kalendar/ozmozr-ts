import Link from "next/link";
import type { ReactNode } from "react";
import type { PersonListItem } from "@/domain/people/profiles";

export function Avatar({ path, name, size = 40 }: { path: string | null; name: string; size?: number }) {
  const style = { width: size, height: size };
  if (path) {
    // eslint-disable-next-line @next/next/no-img-element -- user uploads are served from our own /uploads route
    return <img src={`/${path}`} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span style={{ ...style, fontSize: size * 0.42 }} aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold uppercase text-accent">
      {name.slice(0, 1)}
    </span>
  );
}

export function PersonCard({ person, actions }: { person: PersonListItem; actions?: ReactNode }) {
  return (
    <div className="card flex items-start gap-3">
      <Avatar path={person.avatarPath} name={person.displayName} />
      <div className="min-w-0 flex-1">
        <Link href={`/u/${person.handle}`} className="font-semibold hover:text-accent">{person.displayName}</Link>
        <p className="text-xs text-muted">@{person.handle}</p>
        {person.blurb && <p className="mt-1 line-clamp-2 text-sm text-muted">{person.blurb}</p>}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
