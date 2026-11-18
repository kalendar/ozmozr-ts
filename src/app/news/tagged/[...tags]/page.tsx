import type { SearchParams } from "@/lib/params";
import { pathToTags } from "@/lib/tags";
import { NewsView } from "../../news-view";

export const metadata = { title: "News" };

export default async function TaggedNewsPage({ params, searchParams }: { params: Promise<{ tags: string[] }>; searchParams: SearchParams }) {
  const tags = pathToTags((await params).tags);
  return <NewsView tags={tags} searchParams={searchParams} />;
}
