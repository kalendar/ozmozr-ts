import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";

export default async function Home() {
  if (await getUser()) redirect("/news");
  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="text-4xl font-bold tracking-tight">Let your people filter the web for you.</h1>
      <p className="mt-4 text-lg text-muted">
        Ozmozr is a social feed reader. Subscribe to any RSS feed, tag what matters, share it with friends and
        groups, and find people who read what you read.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/signup" className="btn btn-primary px-5 py-2.5 text-base">Create an account</Link>
        <Link href="/feeds" className="btn px-5 py-2.5 text-base">Browse feeds</Link>
      </div>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {[
          ["Keep everything", "Entries are stored for good, so anything you tagged stays findable."],
          ["Tag freely", "Tag feeds, entries and friends. Combine tags to narrow any view."],
          ["Share on purpose", "Send an entry to a friend or a group with a note."],
          ["Decide together", "Groups vote entries up or down and talk them over."],
        ].map(([title, body]) => (
          <li key={title} className="card">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
