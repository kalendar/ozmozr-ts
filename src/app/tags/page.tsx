import { Empty, TagCloud } from "@/components/ui";
import { getDb } from "@/db/client";
import { globalTagCloud } from "@/domain/search/repo";
import { tagsToPath } from "@/lib/tags";

export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const cloud = await globalTagCloud(getDb(), 150);
  return (
    <div className="max-w-3xl">
      <h1 className="h1 mb-4">Tags</h1>
      {cloud.length === 0 ? <Empty>No tags yet.</Empty> : <div className="card"><TagCloud tags={cloud} hrefFor={(t) => `/tags/${tagsToPath([t])}`} /></div>}
    </div>
  );
}
