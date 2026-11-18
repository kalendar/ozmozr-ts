import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { discoverFeed, discoverFeedUrl, FeedNotFoundError } from "./discover";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
let server: http.Server;
let base: string;
const opts = { allowPrivateHosts: ["127.0.0.1"] };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/feed.xml") return void res.end(fixture("rss2.xml"));
    if (req.url === "/blog") return void res.end(fixture("page.html"));
    if (req.url === "/plain") return void res.end("<html><head><title>x</title></head><body>no feeds</body></html>");
    res.writeHead(404);
    res.end("nope");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

test("returns the address itself when it is already a feed", async () => {
  expect(await discoverFeedUrl(`${base}/feed.xml`, opts)).toBe(`${base}/feed.xml`);
  const found = await discoverFeed(`${base}/feed.xml`, opts);
  expect(found.parsed?.title).toBe("Open Content & Friends");
});

test("finds the first feed advertised by a web page, resolved against the page", async () => {
  expect(await discoverFeedUrl(`${base}/blog`, opts)).toBe(`${base}/feeds/atom.xml`);
});

test("fails clearly when a page advertises no feed", async () => {
  await expect(discoverFeedUrl(`${base}/plain`, opts)).rejects.toBeInstanceOf(FeedNotFoundError);
});

test("fails clearly when the address does not load", async () => {
  await expect(discoverFeedUrl(`${base}/missing`, opts)).rejects.toBeInstanceOf(FeedNotFoundError);
});
