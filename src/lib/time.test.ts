import { expect, test } from "vitest";
import { timeAgo } from "./time";

const now = new Date("2026-11-17T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test("formats elapsed time compactly", () => {
  expect(timeAgo(ago(30_000), now)).toBe("just now");
  expect(timeAgo(ago(5 * MIN), now)).toBe("5m");
  expect(timeAgo(ago(59 * MIN), now)).toBe("59m");
  expect(timeAgo(ago(3 * HOUR), now)).toBe("3h");
  expect(timeAgo(ago(2 * DAY), now)).toBe("2d");
  expect(timeAgo(ago(29 * DAY), now)).toBe("29d");
  expect(timeAgo(ago(120 * DAY), now)).toBe("4mo");
  expect(timeAgo(ago(400 * DAY), now)).toBe("1y");
});

test("treats future dates as just now", () => {
  expect(timeAgo(new Date(now.getTime() + HOUR), now)).toBe("just now");
});
