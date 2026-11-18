import type { SearchParams } from "@/lib/params";
import { NewsView } from "./news-view";

export const metadata = { title: "News" };

export default function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  return <NewsView tags={[]} searchParams={searchParams} />;
}
