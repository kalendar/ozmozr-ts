import type { NewsItem } from "./repo";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A person's news as RSS 2.0. `meta.link` is the news page; entry pages are resolved against it. */
export function renderNewsRss(items: readonly NewsItem[], meta: { title: string; link: string }): string {
  const origin = new URL(meta.link).origin;
  const rendered = items.map((item) => {
    const own = `${origin}/e/${item.id}`;
    return [
      "    <item>",
      `      <title>${esc(item.title)}</title>`,
      `      <link>${esc(item.url ?? own)}</link>`,
      `      <guid isPermaLink="false">${esc(own)}</guid>`,
      `      <pubDate>${item.publishedAt.toUTCString()}</pubDate>`,
      `      <source url="${esc(`${origin}/feeds/${item.feedId}`)}">${esc(item.feedTitle)}</source>`,
      ...item.tags.map((tag) => `      <category>${esc(tag)}</category>`),
      `      <description>${esc(esc(item.summary))}</description>`,
      "    </item>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${esc(meta.title)}</title>`,
    `    <link>${esc(meta.link)}</link>`,
    `    <description>${esc(meta.title)}</description>`,
    ...rendered,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
