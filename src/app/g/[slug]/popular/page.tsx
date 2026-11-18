import type { SearchParams } from "@/lib/params";
import { SharedList } from "../shared-list";

export default async function GroupPopularPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  return <SharedList slug={(await params).slug} sort="popular" searchParams={searchParams} />;
}
