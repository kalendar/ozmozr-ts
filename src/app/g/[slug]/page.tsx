import type { SearchParams } from "@/lib/params";
import { SharedList } from "./shared-list";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  return <SharedList slug={(await params).slug} sort="latest" searchParams={searchParams} />;
}
