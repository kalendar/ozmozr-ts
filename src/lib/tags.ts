export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS = 30;

/** Lowercases, trims and collapses whitespace; null when nothing is left. */
export function normalizeTag(raw: string): string | null {
  const tag = raw.replace(/\s+/g, " ").trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
  return tag.length > 0 ? tag : null;
}

/** De-duplicates already-separated tag names, keeping first-seen order. */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

/**
 * Parses what a person typed into a tag box: tags are separated by spaces or
 * commas, and "double quotes" keep a phrase together. An unclosed quote runs
 * to the end of the input.
 */
export function parseTagInput(input: string): string[] {
  const raw: string[] = [];
  let current = "";
  let inQuote = false;
  for (const ch of input) {
    if (ch === '"') {
      if (inQuote) {
        raw.push(current);
        current = "";
      } else if (current) {
        raw.push(current);
        current = "";
      }
      inQuote = !inQuote;
    } else if (!inQuote && (ch === "," || /\s/.test(ch))) {
      if (current) raw.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) raw.push(current);
  return normalizeTags(raw);
}

/** Formats tags back into tag-box text, quoting phrases. */
export function formatTagInput(tags: readonly string[]): string {
  return tags.map((t) => (/[\s,]/.test(t) ? `"${t}"` : t)).join(" ");
}

/** One URL path segment per tag. */
export function tagsToPath(tags: readonly string[]): string {
  return tags.map((t) => encodeURIComponent(t)).join("/");
}

export function pathToTags(segments: readonly string[]): string[] {
  return normalizeTags(
    segments.map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    }),
  );
}
