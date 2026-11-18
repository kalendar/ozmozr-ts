import Link from "next/link";
import { logOut } from "@/app/(auth)/actions";
import { getUser } from "@/lib/session";

const links = [
  { href: "/news", label: "News" },
  { href: "/feeds", label: "Feeds" },
  { href: "/people", label: "People" },
  { href: "/groups", label: "Groups" },
];

export async function SiteNav() {
  const user = await getUser();
  return (
    <header className="border-b border-line bg-surface">
      <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-accent">
          ozmozr
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm text-ink hover:text-accent">
            {l.label}
          </Link>
        ))}
        <form action="/search" className="ml-auto min-w-0 flex-1 sm:max-w-56">
          <input name="q" type="search" placeholder="Search" aria-label="Search" className="input py-1.5" />
        </form>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/save" className="btn btn-primary">Save link</Link>
            <Link href={`/u/${user.handle}`} className="hover:text-accent">{user.displayName}</Link>
            <Link href="/settings" className="text-muted hover:text-ink">Settings</Link>
            <form action={logOut}>
              <button type="submit" className="cursor-pointer text-muted hover:text-ink">Log out</button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="hover:text-accent">Log in</Link>
            <Link href="/signup" className="btn btn-primary">Sign up</Link>
          </div>
        )}
      </nav>
    </header>
  );
}
