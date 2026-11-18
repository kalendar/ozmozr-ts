import { Parser } from "htmlparser2";
import { FetchLimitError, safeFetch, UnsafeUrlError, type SafeFetchOptions } from "@/lib/safe-fetch";
import { FeedParseError, parseFeed, type ParsedFeed } from "./parse";

export class FeedNotFoundError extends Error {
  override name = "FeedNotFoundError";
}

const FEED_TYPES = new Set(["application/rss+xml", "application/atom+xml", "application/rdf+xml", "application/feed+json"]);

/** Adds https:// when someone types a bare domain. */
export function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function advertisedFeeds(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  const parser = new Parser({
    onopentag(name, attribs) {
      if (name !== "link" || !attribs.href) return;
      const rel = (attribs.rel ?? "").toLowerCase().split(/\s+/);
      const type = (attribs.type ?? "").toLowerCase().trim();
      if (!rel.includes("alternate") || !FEED_TYPES.has(type) || type === "application/feed+json") return;
      try {
        const url = new URL(attribs.href, pageUrl);
        if (url.protocol === "http:" || url.protocol === "https:") found.push(url.href);
      } catch {
        // ignore unparseable hrefs
      }
    },
  });
  parser.write(html);
  parser.end();
  return found;
}

/**
 * Works out the feed address for something a person pasted: either the address
 * is a feed already, or it is a web page that advertises one.
 * `parsed` is set when the feed content was already fetched.
 */
export async function discoverFeed(
  inputUrl: string,
  opts: SafeFetchOptions = {},
): Promise<{ url: string; parsed: ParsedFeed | null }> {
  let res;
  try {
    res = await safeFetch(normalizeInputUrl(inputUrl), opts);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    if (err instanceof FetchLimitError) throw new FeedNotFoundError(`That address could not be loaded: ${err.message}`);
    throw new FeedNotFoundError("That address could not be loaded");
  }
  if (res.status >= 400) throw new FeedNotFoundError(`That address returned an error (${res.status})`);
  try {
    return { url: res.finalUrl, parsed: parseFeed(res.body, res.finalUrl) };
  } catch (err) {
    if (!(err instanceof FeedParseError)) throw err;
  }
  const [firstFeed] = advertisedFeeds(res.body, res.finalUrl);
  if (!firstFeed) throw new FeedNotFoundError("No feed was found at that address");
  return { url: firstFeed, parsed: null };
}

export async function discoverFeedUrl(inputUrl: string, opts: SafeFetchOptions = {}): Promise<string> {
  return (await discoverFeed(inputUrl, opts)).url;
}
