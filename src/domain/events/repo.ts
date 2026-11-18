import { sql } from "kysely";
import type { Db } from "@/db/client";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { safeFetch, type SafeFetchOptions } from "@/lib/safe-fetch";
import { extractEvents, type ConferenceDetails, type ExtractedEvent } from "./extract";

export type { ConferenceDetails };

export type EventItem = {
  id: number;
  entryId: number;
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  url: string;
  description: string;
  conference: ConferenceDetails | null;
};

/** Stores the events found on an entry's page. Returns how many were new. */
export async function storeEvents(db: Db, entryId: number, events: readonly ExtractedEvent[]): Promise<number> {
  let added = 0;
  for (const event of events) {
    const row = await db
      .insertInto("events")
      .values({
        entry_id: entryId,
        name: event.name,
        starts_at: event.startsAt,
        ends_at: event.endsAt,
        location: event.location,
        url: event.url,
        description: event.description,
      })
      .onConflict((oc) => oc.columns(["entry_id", "name", "starts_at"]).doNothing())
      .returning("id")
      .executeTakeFirst();
    if (!row) continue;
    added += 1;
    if (event.conference) {
      await db
        .insertInto("conferences")
        .values({
          event_id: row.id,
          theme: event.conference.theme,
          register_by: event.conference.registerBy,
          submit_by: event.conference.submitBy,
        })
        .execute();
    }
  }
  return added;
}

export const EVENT_RECHECK_HOURS = 24;

/**
 * Fetches an entry's page and stores any events on it. Never throws; returns
 * how many were new. A page that was read successfully is not fetched again
 * for a day; a failed fetch is retried the next time this is called.
 */
export async function extractEventsForEntry(
  db: Db,
  entryId: number,
  fetchOpts: SafeFetchOptions = {},
  now: Date = new Date(),
): Promise<number> {
  try {
    const entry = await db.selectFrom("entries").select(["url", "events_checked_at"]).where("id", "=", entryId).executeTakeFirst();
    if (!entry?.url) return 0;
    const checked = entry.events_checked_at;
    if (checked && now.getTime() - checked.getTime() < EVENT_RECHECK_HOURS * 3_600_000) return 0;
    const res = await safeFetch(entry.url, { maxBytes: 3_000_000, timeoutMs: 8_000, ...fetchOpts });
    if (res.status < 200 || res.status >= 300) return 0;
    await db.updateTable("entries").set({ events_checked_at: now }).where("id", "=", entryId).execute();
    return await storeEvents(db, entryId, extractEvents(res.body, res.finalUrl));
  } catch {
    return 0;
  }
}

/** True when the person saved or tagged the entry, or receives it through a subscription. */
function relatedToUser(userId: string, opts: { includeSubscriptions: boolean }) {
  const viaSubscription = opts.includeSubscriptions
    ? sql`or exists (
        select 1 from entries en join subscriptions sub on sub.feed_id = en.feed_id and sub.user_id = ${userId}
        where en.id = events.entry_id
      )`
    : sql``;
  return sql<boolean>`(
    exists (select 1 from saves sv where sv.entry_id = events.entry_id and sv.user_id = ${userId})
    or exists (select 1 from entry_tags et where et.entry_id = events.entry_id and et.user_id = ${userId})
    ${viaSubscription}
  )`;
}

/**
 * Events that have not finished yet, on entries the person saved, tagged or
 * receives through a subscription. Soonest first.
 */
export async function listUpcomingEvents(db: Db, userId: string, opts: { limit?: number; now?: Date } = {}): Promise<EventItem[]> {
  const now = opts.now ?? new Date();
  const rows = await db
    .selectFrom("events")
    .leftJoin("conferences as c", "c.event_id", "events.id")
    .select([
      "events.id",
      "events.entry_id as entryId",
      "events.name",
      "events.starts_at as startsAt",
      "events.ends_at as endsAt",
      "events.location",
      "events.url",
      "events.description",
      "c.event_id as conferenceId",
      "c.theme",
      "c.register_by as registerBy",
      "c.submit_by as submitBy",
    ])
    .where(sql<boolean>`coalesce(events.ends_at, events.starts_at) >= ${now}`)
    .where(relatedToUser(userId, { includeSubscriptions: true }))
    .orderBy("events.starts_at")
    .orderBy("events.id")
    .limit(opts.limit ?? 20)
    .execute();
  return rows.map(({ conferenceId, theme, registerBy, submitBy, ...event }) => ({
    ...event,
    conference: conferenceId === null ? null : { theme, registerBy, submitBy },
  }));
}

/**
 * Sets (or with null, removes) an event's conference details. Allowed for
 * people who saved or tagged the entry the event came from.
 */
export async function setConference(db: Db, userId: string, eventId: number, input: ConferenceDetails | null): Promise<void> {
  const event = await db.selectFrom("events").select("id").where("id", "=", eventId).executeTakeFirst();
  if (!event) throw new NotFoundError("That event no longer exists");
  const allowed = await db
    .selectFrom("events")
    .select("id")
    .where("id", "=", eventId)
    .where(relatedToUser(userId, { includeSubscriptions: false }))
    .executeTakeFirst();
  if (!allowed) throw new ForbiddenError("Save or tag the entry this event came from to edit it");
  if (input === null) {
    await db.deleteFrom("conferences").where("event_id", "=", eventId).execute();
    return;
  }
  const values = {
    theme: input.theme?.trim().slice(0, 300) || null,
    register_by: input.registerBy,
    submit_by: input.submitBy,
  };
  await db
    .insertInto("conferences")
    .values({ event_id: eventId, ...values })
    .onConflict((oc) => oc.column("event_id").doUpdateSet(values))
    .execute();
}
