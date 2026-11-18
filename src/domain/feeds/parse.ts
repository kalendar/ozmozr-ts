import { createHash } from "node:crypto";
import { decodeXML } from "entities";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { htmlToText, sanitizeHtml } from "@/lib/sanitize";
import { normalizeTags } from "@/lib/tags";

export class FeedParseError extends Error {
  override name = "FeedParseError";
}

export type ParsedItem = {
  guid: string;
  url: string | null;
  title: string;
  summary: string;
  contentHtml: string;
  author: string | null;
  publishedAt: Date | null;
  categories: string[];
};

export type ParsedFeed = { title: string; description: string; siteUrl: string | null; items: ParsedItem[] };

const MAX_ITEMS = 500;
const MAX_CATEGORIES = 10;
const MAX_URL_BYTES = 2000;
const MAX_GUID_BYTES = 1000;

/** Postgres text cannot hold NUL. */
function noNul(value: string): string {
  return value.replace(/\u0000/g, "");
}
const ATOM_TEXT = ["title", "subtitle", "summary", "content", "rights"];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Atom text constructs are kept raw: their meaning depends on the type attribute.
  stopNodes: [...ATOM_TEXT.map((t) => `feed.${t}`), ...ATOM_TEXT.map((t) => `feed.entry.${t}`)],
  isArray: (name) => ["item", "entry", "link", "category", "dc:subject", "author"].includes(name),
});

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Text of an element, whether it parsed as a string or as { "#text", ...attributes }. */
function text(value: unknown): string {
  const v = first(value);
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (isNode(v) && typeof v["#text"] === "string") return v["#text"].trim();
  return "";
}

function attr(value: unknown, name: string): string {
  const v = first(value);
  return isNode(v) && typeof v[`@_${name}`] === "string" ? (v[`@_${name}`] as string) : "";
}

function httpUrl(raw: string, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Longer addresses cannot be indexed, and one such row would fail the whole feed.
    return Buffer.byteLength(url.href) <= MAX_URL_BYTES ? url.href : null;
  } catch {
    return null;
  }
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** An Atom text construct as HTML. */
function atomHtml(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const type = attr(value, "type") || "text";
  if (type === "xhtml") return raw;
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  const unescaped = cdata ? cdata[1]! : decodeXML(raw);
  return type === "html" ? unescaped : escapeHtml(unescaped);
}

function cleanTitle(html: string): string {
  return htmlToText(html, 300);
}

function finishItem(
  raw: { guid: string; link: string | null; titleHtml: string; bodyHtml: string; summaryHtml: string; author: string; date: Date | null; categories: string[] },
  feedUrl: string,
): ParsedItem {
  const summary = htmlToText(raw.summaryHtml || raw.bodyHtml, 300);
  const title = cleanTitle(raw.titleHtml) || htmlToText(raw.summaryHtml || raw.bodyHtml, 100_000).slice(0, 80) || "Untitled";
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  let guid = noNul(raw.guid || raw.link || "") || hash(`${title}|${raw.date ? raw.date.toISOString() : ""}`);
  if (Buffer.byteLength(guid) > MAX_GUID_BYTES) guid = hash(guid);
  return {
    guid,
    url: raw.link,
    title: noNul(title),
    summary: noNul(summary),
    contentHtml: noNul(sanitizeHtml(raw.bodyHtml || raw.summaryHtml, raw.link ?? feedUrl)),
    author: raw.author ? noNul(htmlToText(raw.author, 200)) || null : null,
    publishedAt: raw.date,
    categories: normalizeTags(raw.categories).slice(0, MAX_CATEGORIES),
  };
}

function rssItem(item: Node, feedUrl: string, rdf: boolean): ParsedItem {
  const description = text(item.description);
  const encoded = text(item["content:encoded"]);
  const categories = [
    ...list(item.category).map((c) => text(c)),
    ...list(item["dc:subject"]).map((c) => text(c)),
  ];
  return finishItem(
    {
      guid: text(item.guid) || (rdf ? attr(item, "rdf:about") : ""),
      link: httpUrl(text(first(item.link)), feedUrl),
      titleHtml: text(item.title),
      bodyHtml: encoded || description,
      summaryHtml: description,
      author: text(item["dc:creator"]) || text(first(item.author)),
      date: parseDate(text(item.pubDate) || text(item["dc:date"])),
      categories,
    },
    feedUrl,
  );
}

function atomLink(links: unknown, feedUrl: string): string | null {
  const all = list(links).filter(isNode);
  const pick =
    all.find((l) => (l["@_rel"] ?? "alternate") === "alternate" && l["@_type"] === "text/html") ??
    all.find((l) => (l["@_rel"] ?? "alternate") === "alternate");
  return pick && typeof pick["@_href"] === "string" ? httpUrl(pick["@_href"], feedUrl) : null;
}

function atomEntry(entry: Node, feedUrl: string): ParsedItem {
  const author = first(entry.author);
  return finishItem(
    {
      guid: text(entry.id),
      link: atomLink(entry.link, feedUrl),
      titleHtml: atomHtml(entry.title),
      bodyHtml: atomHtml(entry.content),
      summaryHtml: atomHtml(entry.summary),
      author: isNode(author) ? text(author.name) : text(author),
      date: parseDate(text(entry.published) || text(entry.updated)),
      categories: list(entry.category).map((c) => attr(c, "term") || text(c)),
    },
    feedUrl,
  );
}

/**
 * Parses RSS 2.0, RSS 1.0 (RDF) or Atom. Item HTML is sanitised and links are
 * absolute http(s) URLs. Throws FeedParseError for anything that is not a
 * well-formed feed.
 */
export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  // NUL characters (raw or as character references) are not valid XML and cannot be stored.
  const source = xml.replace(/^\uFEFF/, "").replace(/\u0000|&#(?:x0+|0+);/gi, "").trim();
  if (!source.startsWith("<")) throw new FeedParseError("This does not look like a feed");
  const valid = XMLValidator.validate(source);
  if (valid !== true) throw new FeedParseError(`The feed is not well-formed XML: ${valid.err.msg}`);
  let doc: Node;
  try {
    doc = parser.parse(source) as Node;
  } catch (err) {
    throw new FeedParseError(err instanceof Error ? err.message : "The feed could not be read");
  }

  const rss = doc.rss;
  const rdf = doc["rdf:RDF"];
  const feed = doc.feed;

  if (isNode(rss) && isNode(rss.channel)) {
    const channel = rss.channel;
    return {
      title: cleanTitle(text(channel.title)),
      description: htmlToText(text(channel.description), 3000),
      siteUrl: httpUrl(text(first(channel.link)), feedUrl),
      items: list(channel.item).filter(isNode).slice(0, MAX_ITEMS).map((i) => rssItem(i, feedUrl, false)),
    };
  }
  if (isNode(rdf)) {
    const channel = isNode(rdf.channel) ? rdf.channel : {};
    return {
      title: cleanTitle(text(channel.title)),
      description: htmlToText(text(channel.description), 3000),
      siteUrl: httpUrl(text(first(channel.link)), feedUrl),
      items: list(rdf.item).filter(isNode).slice(0, MAX_ITEMS).map((i) => rssItem(i, feedUrl, true)),
    };
  }
  if (isNode(feed)) {
    return {
      title: cleanTitle(atomHtml(feed.title)),
      description: htmlToText(atomHtml(feed.subtitle), 3000),
      siteUrl: atomLink(feed.link, feedUrl),
      items: list(feed.entry).filter(isNode).slice(0, MAX_ITEMS).map((e) => atomEntry(e, feedUrl)),
    };
  }
  throw new FeedParseError("This does not look like an RSS or Atom feed");
}
