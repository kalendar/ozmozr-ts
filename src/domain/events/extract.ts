import { Parser } from "htmlparser2";
import { htmlToText } from "@/lib/sanitize";

export type ConferenceDetails = { theme: string | null; registerBy: Date | null; submitBy: Date | null };

export type ExtractedEvent = {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  url: string;
  description: string;
  /** Set when the event is a conference; submitBy is never found in page data. */
  conference: ConferenceDetails | null;
};

const MAX_EVENTS = 50;
const CONFERENCE_TYPES = new Set(["EducationEvent", "BusinessEvent"]);
const CONFERENCE_NAME = /\b(conference|symposium|summit|congress)\b/i;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function date(value: unknown): Date | null {
  const raw = str(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function types(node: Json): string[] {
  const t = node["@type"];
  const list = Array.isArray(t) ? t : [t];
  return list.filter((x): x is string => typeof x === "string").map((x) => x.replace(/^.*[/:#]/, ""));
}

function locationText(value: unknown): string | null {
  if (typeof value === "string") return value.trim().slice(0, 300) || null;
  if (Array.isArray(value)) return locationText(value[0]);
  if (!isObject(value)) return null;
  const parts: string[] = [];
  const name = str(value.name);
  if (name) parts.push(name);
  const address = value.address;
  if (typeof address === "string") parts.push(address.trim());
  else if (isObject(address)) {
    for (const key of ["streetAddress", "addressLocality", "addressRegion", "addressCountry"]) {
      const part = isObject(address[key]) ? str((address[key] as Json).name) : str(address[key]);
      if (part) parts.push(part);
    }
  }
  if (parts.length === 0) parts.push(str(value.url));
  return parts.filter(Boolean).join(", ").slice(0, 300) || null;
}

function earliestOfferDeadline(offers: unknown): Date | null {
  const list = Array.isArray(offers) ? offers : [offers];
  const dates = list
    .filter(isObject)
    .map((o) => date(o.validThrough))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

function toEvent(node: Json, pageUrl: string): ExtractedEvent | null {
  const nodeTypes = types(node);
  if (!nodeTypes.some((t) => t === "Event" || t.endsWith("Event"))) return null;
  const name = htmlToText(str(node.name), 300);
  const startsAt = date(node.startDate);
  if (!name || !startsAt) return null;

  let url = pageUrl;
  try {
    const candidate = new URL(str(node.url) || pageUrl, pageUrl);
    if (candidate.protocol === "http:" || candidate.protocol === "https:") url = candidate.href;
  } catch {
    // keep the page url
  }
  const isConference = nodeTypes.some((t) => CONFERENCE_TYPES.has(t)) || CONFERENCE_NAME.test(name);
  const about = Array.isArray(node.about) ? node.about[0] : node.about;
  const theme = (isObject(about) ? str(about.name) : str(about)).slice(0, 300) || null;

  return {
    name,
    startsAt,
    endsAt: date(node.endDate),
    location: locationText(node.location),
    url,
    description: htmlToText(str(node.description), 2000),
    conference: isConference ? { theme, registerBy: earliestOfferDeadline(node.offers), submitBy: null } : null,
  };
}

function walk(value: unknown, pageUrl: string, out: ExtractedEvent[], depth: number): void {
  if (depth > 12 || out.length >= MAX_EVENTS) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, pageUrl, out, depth + 1);
    return;
  }
  if (!isObject(value)) return;
  const event = toEvent(value, pageUrl);
  if (event && out.length < MAX_EVENTS) out.push(event);
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) walk(child, pageUrl, out, depth + 1);
  }
}

/**
 * Finds schema.org events (Event and its subtypes) in a page's JSON-LD blocks.
 * Blocks that are not valid JSON are skipped; nothing here throws.
 */
export function extractEvents(html: string, pageUrl: string): ExtractedEvent[] {
  const blocks: string[] = [];
  let current: string | null = null;
  const parser = new Parser({
    onopentag(name, attribs) {
      if (name === "script" && (attribs.type ?? "").toLowerCase().trim() === "application/ld+json") current = "";
    },
    ontext(text) {
      if (current !== null) current += text;
    },
    onclosetag(name) {
      if (name === "script" && current !== null) {
        blocks.push(current);
        current = null;
      }
    },
  });
  parser.write(html);
  parser.end();

  const out: ExtractedEvent[] = [];
  for (const block of blocks) {
    try {
      walk(JSON.parse(block), pageUrl, out, 0);
    } catch {
      // not JSON: ignore this block
    }
  }
  const seen = new Set<string>();
  return out.filter((e) => {
    const key = `${e.name}|${e.startsAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
