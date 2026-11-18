import { requireUser } from "@/lib/session";

export const metadata = { title: "News" };

export default async function NewsPage() {
  await requireUser();
  return (
    <div>
      <h1 className="h1">My News</h1>
      <p className="mt-2 text-muted">Nothing here yet. Subscribe to a feed to get started.</p>
    </div>
  );
}
