import { XMLParser } from "fast-xml-parser";
import { sql } from "kysely";
import type { Db } from "@/db/client";
import { ValidationError } from "@/lib/errors";
import { normalizeTag, normalizeTags } from "@/lib/tags";
import { subscribeToFeedUrl } from "./repo";

export type OpmlFeed = { url: string; title: string; tags: string[] };
export const OPML_IMPORT_LIMIT = 500;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  isArray: (name) => name === "outline",
});

type Outline = Record<string, unknown>;

function attr(node: Outline, name: string): string {
  const value = node[`@_${name}`];
  return typeof value === "string" ? value.trim() : "";
}

function walk(nodes: unknown, folders: string[], out: OpmlFeed[]): void {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes as Outline[]) {
    if (typeof node !== "object" || node === null) continue;
    const label = attr(node, "title") || attr(node, "text");
    const url = attr(node, "xmlUrl");
    if (url) {
      const categories = attr(node, "category").split(",");
      out.push({ url, title: label, tags: normalizeTags([...folders, ...categories]) });
    } else {
      const folder = normalizeTag(label);
      walk(node.outline, folder ? [...folders, folder] : folders, out);
    }
  }
}

/** Reads the feeds out of an OPML file. Each enclosing folder name becomes a tag. */
export function parseOpml(xml: string): OpmlFeed[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new ValidationError("That file could not be read as OPML");
  }
  const opml = doc.opml as Record<string, unknown> | undefined;
  const body = opml && typeof opml === "object" ? (opml.body as Record<string, unknown> | undefined) : undefined;
  if (!body || typeof body !== "object") throw new ValidationError("That file is not an OPML subscription list");
  const out: OpmlFeed[] = [];
  walk(body.outline, [], out);
  return out;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderOpml(subs: readonly OpmlFeed[]): string {
  const outlines = subs.map((s) => {
    const category = s.tags.length > 0 ? ` category="${esc(s.tags.join(","))}"` : "";
    return `    <outline type="rss" text="${esc(s.title)}" title="${esc(s.title)}" xmlUrl="${esc(s.url)}"${category}/>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head><title>Ozmozr subscriptions</title></head>",
    "  <body>",
    ...outlines,
    "  </body>",
    "</opml>",
    "",
  ].join("\n");
}

export async function listSubscriptionsForExport(db: Db, userId: string): Promise<OpmlFeed[]> {
  return db
    .selectFrom("subscriptions as s")
    .innerJoin("feeds as f", "f.id", "s.feed_id")
    .select([
      "f.url",
      sql<string>`coalesce(nullif(s.title, ''), f.title)`.as("title"),
      sql<string[]>`coalesce((
        select array_agg(t.name order by t.name) from subscription_tags st
        join tags t on t.id = st.tag_id where st.subscription_id = s.id
      ), '{}')`.as("tags"),
    ])
    .where("s.user_id", "=", userId)
    .where("f.kind", "=", "rss")
    .orderBy(sql`lower(coalesce(nullif(s.title, ''), f.title))`)
    .orderBy("f.id")
    .execute();
}

function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.protocol === "http:" || url.protocol === "https:") && raw.length <= 2000;
  } catch {
    return false;
  }
}

/**
 * Subscribes a person to every feed in an OPML file. Nothing is fetched here:
 * new feeds are created with the file's title and harvested by the worker.
 */
export async function importOpml(
  db: Db,
  userId: string,
  xml: string,
): Promise<{ added: number; skipped: number; failed: { url: string; reason: string }[] }> {
  const feeds = parseOpml(xml);
  const failed: { url: string; reason: string }[] = [];
  let added = 0;
  let skipped = 0;
  const existing = new Set(
    (
      await db
        .selectFrom("subscriptions as s")
        .innerJoin("feeds as f", "f.id", "s.feed_id")
        .select("f.url")
        .where("s.user_id", "=", userId)
        .execute()
    ).map((r) => r.url),
  );
  for (const feed of feeds) {
    if (!isHttpUrl(feed.url)) {
      failed.push({ url: feed.url.slice(0, 200), reason: "Not a web address" });
    } else if (existing.has(feed.url)) {
      skipped += 1;
    } else if (added >= OPML_IMPORT_LIMIT) {
      failed.push({ url: feed.url, reason: `Over the ${OPML_IMPORT_LIMIT}-feed limit for one import` });
    } else {
      await subscribeToFeedUrl(db, userId, { feedUrl: feed.url, feedTitle: feed.title, tags: feed.tags });
      existing.add(feed.url);
      added += 1;
    }
  }
  return { added, skipped, failed };
}
