import { getDb } from "@/db/client";
import { listSubscriptionsForExport, renderOpml } from "@/domain/feeds/opml";
import { getUser } from "@/lib/session";

export async function GET(): Promise<Response> {
  const user = await getUser();
  if (!user) return new Response("Log in first", { status: 401 });
  const subs = await listSubscriptionsForExport(getDb(), user.id);
  return new Response(renderOpml(subs), {
    headers: {
      "content-type": "text/x-opml; charset=utf-8",
      "content-disposition": 'attachment; filename="ozmozr-subscriptions.opml"',
    },
  });
}
