import { decodeHTML } from "entities";
import sanitize from "sanitize-html";

const ALLOWED_TAGS = [
  "p", "br", "hr", "a", "img", "blockquote", "ul", "ol", "li", "pre", "code",
  "em", "strong", "b", "i", "u", "s", "sub", "sup", "h2", "h3", "h4",
  "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td",
];

function absolute(url: string | undefined, baseUrl: string): string | null {
  if (!url) return null;
  try {
    const resolved = new URL(url, baseUrl);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : null;
  } catch {
    return null;
  }
}

/**
 * Makes HTML from a feed or fetched page safe to store and render: only plain
 * article markup survives, URLs are made absolute and limited to http(s).
 */
export function sanitizeHtml(html: string, baseUrl: string): string {
  return sanitize(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "rel", "target"], img: ["src", "alt", "title", "width", "height"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "template"],
    transformTags: {
      a: (tagName, attribs) => {
        const href = absolute(attribs.href, baseUrl);
        return {
          tagName,
          attribs: href ? { href, rel: "noopener nofollow ugc", target: "_blank" } : {},
        };
      },
      img: (tagName, attribs) => {
        const src = absolute(attribs.src, baseUrl);
        const kept: Record<string, string> = {};
        if (src) kept.src = src;
        if (attribs.alt) kept.alt = attribs.alt;
        return { tagName, attribs: kept };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}

/** Plain text of some HTML, cut to maxLength with a trailing ellipsis. */
export function htmlToText(html: string, maxLength = 300): string {
  const stripped = sanitize(html, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "template"],
  });
  const text = decodeHTML(stripped).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
