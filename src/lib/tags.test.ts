import { expect, test } from "vitest";
import { normalizeTag, parseTagInput, pathToTags, tagsToPath } from "./tags";

test("splits on spaces and keeps quoted phrases together, lowercased", () => {
  expect(parseTagInput('OER  "open education" rss')).toEqual(["oer", "open education", "rss"]);
});

test("removes duplicates that differ only by case", () => {
  expect(parseTagInput("rss RSS Rss")).toEqual(["rss"]);
});

test("an unclosed quote keeps the rest as one phrase", () => {
  expect(parseTagInput('"unclosed phrase here')).toEqual(["unclosed phrase here"]);
});

test("commas also separate tags", () => {
  expect(parseTagInput("a, b,c")).toEqual(["a", "b", "c"]);
});

test("blank input gives no tags", () => {
  expect(parseTagInput("   ")).toEqual([]);
  expect(parseTagInput('""')).toEqual([]);
});

test("tags are cut to 50 characters", () => {
  expect(parseTagInput("x".repeat(80))).toEqual(["x".repeat(50)]);
});

test("collapses whitespace inside a phrase", () => {
  expect(parseTagInput('"open    education\t now"')).toEqual(["open education now"]);
});

test("at most 30 tags are kept", () => {
  const input = Array.from({ length: 40 }, (_, i) => `t${i}`).join(" ");
  expect(parseTagInput(input)).toHaveLength(30);
});

test("normalizeTag cleans a single phrase", () => {
  expect(normalizeTag("  Open   Education ")).toBe("open education");
  expect(normalizeTag("  ")).toBeNull();
});

test("tags survive a round trip through a URL path", () => {
  expect(pathToTags(tagsToPath(["open education", "c#"]).split("/"))).toEqual(["open education", "c#"]);
  expect(tagsToPath(["a/b"])).toBe("a%2Fb");
  expect(pathToTags(["100%"])).toEqual(["100%"]);
});
