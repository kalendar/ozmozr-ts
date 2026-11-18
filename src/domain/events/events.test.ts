import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { withTestDb } from "@/db/test-db";
import { makeEntry, makeFeed, makeUser } from "@/db/test-helpers";
import { saveLink } from "@/domain/bookmarks/repo";
import { subscribeToFeedUrl } from "@/domain/feeds/repo";
import { setEntryTags } from "@/domain/tags/repo";
import { ForbiddenError } from "@/lib/errors";
import { extractEvents, type ExtractedEvent } from "./extract";
import { renderIcal } from "./ical";
import { listUpcomingEvents, setConference, storeEvents, type EventItem } from "./repo";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const now = new Date("2026-11-17T12:00:00Z");

test("reads a schema.org event subtype from JSON-LD", () => {
  const events = extractEvents(fixture("concert.html"), "https://venue.example/whats-on");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    name: "The Quaggas Live",
    location: "Logan Tabernacle, 50 N Main St, Logan, UT, US",
    url: "https://venue.example/gigs/quaggas",
    description: "An evening of music.",
    conference: null, // a MusicEvent is not a conference
  });
  expect(events[0]!.startsAt.toISOString()).toBe("2027-03-06T02:30:00.000Z");
  expect(events[0]!.endsAt?.toISOString()).toBe("2027-03-06T05:00:00.000Z");
});

test("walks @graph, arrays and nested events; skips undated, unnamed and non-events", () => {
  const events = extractEvents(fixture("conference.html"), "https://conf.example/");
  expect(events.map((e) => e.name)).toEqual([
    "OpenEd Gathering 2027", "Open Education Conference 2027", "Array item", "Nested workshop",
  ]);
  expect(events[1]!.location).toBe("https://conf.example/live");
  expect(events[1]!.url).toBe("https://conf.example/");
});

test("conferences: EducationEvent takes the earliest offer deadline; a name can make one too", () => {
  const [gathering, named, plain] = extractEvents(fixture("conference.html"), "https://conf.example/");
  expect(gathering!.conference).toEqual({
    theme: "Sustaining open education",
    registerBy: new Date("2027-08-01T23:59:00Z"),
    submitBy: null,
  });
  expect(named!.conference).toEqual({ theme: null, registerBy: null, submitBy: null });
  expect(plain!.conference).toBeNull();
});

test("malformed or missing JSON-LD yields no events, without throwing", () => {
  expect(extractEvents('<script type="application/ld+json">{ nope </script>', "https://x.example/")).toEqual([]);
  expect(extractEvents("<html><body>plain</body></html>", "https://x.example/")).toEqual([]);
  expect(extractEvents("", "https://x.example/")).toEqual([]);
});

const sample = (over: Partial<ExtractedEvent> = {}): ExtractedEvent => ({
  name: "Meetup", startsAt: new Date("2026-12-01T18:00:00Z"), endsAt: new Date("2026-12-01T20:00:00Z"),
  location: "Library", url: "https://x.example/meetup", description: "Come along", conference: null, ...over,
});

test("stores events once, with their conference details", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const { entryId } = await saveLink(db, alice, { url: "https://x.example/page", title: "Page", tags: [] });
    const events = [sample(), sample({ name: "Conf", conference: { theme: "Open", registerBy: new Date("2026-11-25T00:00:00Z"), submitBy: null } })];
    expect(await storeEvents(db, entryId, events)).toBe(2);
    expect(await storeEvents(db, entryId, events)).toBe(0);
    const upcoming = await listUpcomingEvents(db, alice, { now });
    expect(upcoming.map((e) => e.name)).toEqual(["Meetup", "Conf"]);
    expect(upcoming[0]!.conference).toBeNull();
    expect(upcoming[1]!.conference).toEqual({ theme: "Open", registerBy: new Date("2026-11-25T00:00:00Z"), submitBy: null });
  }));

test("upcoming events come from what I saved, tagged or subscribe to; past ones are left out", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const feed = await makeFeed(db, "https://blog.example/feed");
    const subscribed = await makeEntry(db, feed, { title: "From my feed" });
    const other = await makeFeed(db, "https://other.example/feed");
    const tagged = await makeEntry(db, other, { title: "I tagged this" });
    const unrelated = await makeEntry(db, other, { title: "Not mine" });
    await subscribeToFeedUrl(db, alice, { feedUrl: "https://blog.example/feed", tags: [] });
    await setEntryTags(db, alice, tagged, ["events"]);
    const saved = await saveLink(db, alice, { url: "https://x.example/saved", title: "Saved", tags: [] });

    await storeEvents(db, subscribed, [sample({ name: "Feed event", startsAt: new Date("2026-12-03T00:00:00Z"), endsAt: null })]);
    await storeEvents(db, tagged, [sample({ name: "Tagged event", startsAt: new Date("2026-12-02T00:00:00Z"), endsAt: null })]);
    await storeEvents(db, saved.entryId, [
      sample({ name: "Saved event" }),
      sample({ name: "Over already", startsAt: new Date("2026-11-01T00:00:00Z"), endsAt: new Date("2026-11-02T00:00:00Z") }),
      sample({ name: "Still running", startsAt: new Date("2026-11-16T00:00:00Z"), endsAt: new Date("2026-11-18T00:00:00Z") }),
      sample({ name: "Started, no end", startsAt: new Date("2026-11-17T09:00:00Z"), endsAt: null }),
    ]);
    await storeEvents(db, unrelated, [sample({ name: "Someone else's" })]);

    expect((await listUpcomingEvents(db, alice, { now })).map((e) => e.name)).toEqual([
      "Still running", "Saved event", "Tagged event", "Feed event",
    ]);
    expect((await listUpcomingEvents(db, alice, { now, limit: 2 })).map((e) => e.name)).toEqual(["Still running", "Saved event"]);
    expect(await listUpcomingEvents(db, bobby, { now })).toEqual([]);
  }));

test("only someone who saved or tagged the entry can edit conference details", () =>
  withTestDb(async (db) => {
    const alice = await makeUser(db, "alice");
    const bobby = await makeUser(db, "bobby");
    const { entryId } = await saveLink(db, alice, { url: "https://x.example/page", title: "Page", tags: [] });
    await storeEvents(db, entryId, [sample()]);
    const [event] = await listUpcomingEvents(db, alice, { now });
    const details = { theme: "Open futures", registerBy: new Date("2026-11-28T00:00:00Z"), submitBy: new Date("2026-11-20T00:00:00Z") };
    await expect(setConference(db, bobby, event!.id, details)).rejects.toBeInstanceOf(ForbiddenError);
    await setConference(db, alice, event!.id, details);
    expect((await listUpcomingEvents(db, alice, { now }))[0]!.conference).toEqual(details);
    await setConference(db, alice, event!.id, { ...details, theme: "  " });
    expect((await listUpcomingEvents(db, alice, { now }))[0]!.conference?.theme).toBeNull();
    await setConference(db, alice, event!.id, null);
    expect((await listUpcomingEvents(db, alice, { now }))[0]!.conference).toBeNull();
  }));

const item = (over: Partial<EventItem> = {}): EventItem => ({
  id: 7, entryId: 1, name: "Open; Ed, Meetup", startsAt: new Date("2026-12-01T18:00:00Z"), endsAt: new Date("2026-12-01T20:00:00Z"),
  location: "Room 1\nLibrary", url: "https://x.example/meetup", description: "Line one\nLine two", conference: null, ...over,
});

test("renders one VEVENT per event with UTC times and escaped text", () => {
  const ics = renderIcal([item(), item({ id: 8, name: "No end", endsAt: null })], "Ada's events", now);
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(ics).toContain("DTSTART:20261201T180000Z");
  expect(ics).toContain("DTEND:20261201T200000Z");
  expect(ics).toContain("SUMMARY:Open\; Ed\\, Meetup");
  expect(ics).toContain("LOCATION:Room 1\\nLibrary");
  expect(ics).toContain("UID:event-7@ozmozr");
  expect(ics).toContain("X-WR-CALNAME:Ada's events");
  expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
});

test("a conference with both deadlines adds two all-day events", () => {
  const ics = renderIcal(
    [item({ name: "OpenEd", conference: { theme: "T", registerBy: new Date("2026-11-25T23:59:00Z"), submitBy: new Date("2026-11-20T12:00:00Z") } })],
    "Cal",
    now,
  );
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  expect(ics).toContain("SUMMARY:Register by: OpenEd");
  expect(ics).toContain("DTSTART;VALUE=DATE:20261125");
  expect(ics).toContain("SUMMARY:Submit by: OpenEd");
  expect(ics).toContain("DTSTART;VALUE=DATE:20261120");
});
