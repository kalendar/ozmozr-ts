import { getDb } from "@/db/client";
import { listNews } from "@/domain/news/repo";
import { renderNewsRss } from "@/domain/news/rss";
import { getProfileByUserId, getUserIdByFeedKey } from "@/domain/people/profiles";
import { siteOrigin } from "@/lib/site";
import { pathToTags } from "@/lib/tags";

/** A person's news as RSS, addressed by their private feed key. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const db = getDb();
  const userId = await getUserIdByFeedKey(db, url.searchParams.get("key") ?? "");
  if (!userId) return new Response("Not found", { status: 404 });
  const tagPath = url.searchParams.get("tags");
  const tags = tagPath ? pathToTags(tagPath.split("/")) : [];
  const [items, profile] = await Promise.all([listNews(db, userId, { tags, limit: 50 }), getProfileByUserId(db, userId)]);
  const title = `${profile?.display_name ?? "My"} news on Ozmozr${tags.length > 0 ? `: ${tags.join(", ")}` : ""}`;
  return new Response(renderNewsRss(items, { title, link: `${siteOrigin(request)}/news` }), {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "private, max-age=300" },
  });
}
