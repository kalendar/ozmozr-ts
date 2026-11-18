import { getDb } from "@/db/client";
import { renderIcal } from "@/domain/events/ical";
import { listUpcomingEvents } from "@/domain/events/repo";
import { getProfileByUserId, getUserIdByFeedKey } from "@/domain/people/profiles";

/** A person's upcoming events as an iCalendar feed, addressed by their private feed key. */
export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const userId = await getUserIdByFeedKey(db, new URL(request.url).searchParams.get("key") ?? "");
  if (!userId) return new Response("Not found", { status: 404 });
  const [events, profile] = await Promise.all([listUpcomingEvents(db, userId, { limit: 200 }), getProfileByUserId(db, userId)]);
  return new Response(renderIcal(events, `${profile?.display_name ?? "My"} events on Ozmozr`), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" },
  });
}
