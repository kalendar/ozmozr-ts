import { normalizeTags } from "./tags";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** ?page=N, at least 1. */
export function pageParam(value: string | string[] | undefined): number {
  const n = Number.parseInt(firstParam(value) ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

/** Repeated ?tag=a&tag=b. */
export function tagParams(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return normalizeTags(Array.isArray(value) ? value : [value]);
}

/** A positive integer route id, or null. */
export function idParam(value: string): number | null {
  return /^\d{1,15}$/.test(value) ? Number(value) : null;
}

/** Builds "?a=1&tag=x&tag=y" from a mix of scalars and arrays, skipping empties. */
export function queryString(params: Record<string, string | number | string[] | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) for (const v of value) qs.append(key, v);
    else if (!(key === "page" && Number(value) <= 1)) qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}
