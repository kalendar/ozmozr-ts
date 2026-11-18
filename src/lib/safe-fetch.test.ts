import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { FetchLimitError, isBlockedAddress, safeFetch, UnsafeUrlError } from "./safe-fetch";

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/ok") return void res.end("hello");
    if (url.pathname === "/hop") {
      const n = Number(url.searchParams.get("n"));
      res.writeHead(302, { location: n > 1 ? `/hop?n=${n - 1}` : "/ok" });
      return void res.end();
    }
    if (url.pathname === "/to-private") {
      res.writeHead(302, { location: "http://10.0.0.5/secret" });
      return void res.end();
    }
    if (url.pathname === "/big") return void res.end("x".repeat(20_000));
    if (url.pathname === "/stall") {
      res.writeHead(200);
      res.write("partial");
      return; // never ends
    }
    if (url.pathname === "/echo") return void res.end(JSON.stringify(req.headers));
    if (url.pathname === "/latin1") {
      res.writeHead(200, { "content-type": "text/xml; charset=iso-8859-1" });
      return void res.end(Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

// "public.test" stands in for a public host: it resolves to the local test server
// and is exempted from the private-address check.
const pub = () => ({
  resolve: async (host: string) =>
    host === "public.test" ? [{ address: "127.0.0.1", family: 4 as const }] : [{ address: host, family: 4 as const }],
  allowPrivateHosts: ["public.test"],
});
const url = (path: string) => `http://public.test:${port}${path}`;

test.each([
  "http://127.0.0.1/",
  "http://localhost/",
  "http://[::1]/",
  "http://169.254.169.254/latest/meta-data",
  "http://10.0.0.5/",
  "http://192.168.1.1/",
  "http://172.16.0.1/",
  "http://[::ffff:127.0.0.1]/",
  "http://0.0.0.0/",
  "ftp://example.com/",
  "file:///etc/passwd",
  "not a url",
])("refuses %s", async (target) => {
  await expect(safeFetch(target)).rejects.toBeInstanceOf(UnsafeUrlError);
});

test("refuses a public name that resolves to a private address", async () => {
  await expect(
    safeFetch("http://sneaky.test/", { resolve: async () => [{ address: "10.1.2.3", family: 4 }] }),
  ).rejects.toBeInstanceOf(UnsafeUrlError);
});

test("refuses when any resolved address is private", async () => {
  await expect(
    safeFetch("http://mixed.test/", {
      resolve: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    }),
  ).rejects.toBeInstanceOf(UnsafeUrlError);
});

test("refuses a redirect to a private address", async () => {
  await expect(safeFetch(url("/to-private"), pub())).rejects.toBeInstanceOf(UnsafeUrlError);
});

test("fetches a page", async () => {
  const res = await safeFetch(url("/ok"), pub());
  expect(res.status).toBe(200);
  expect(res.body).toBe("hello");
});

test("follows three redirects and reports the final url", async () => {
  const res = await safeFetch(url("/hop?n=3"), pub());
  expect(res.body).toBe("hello");
  expect(res.finalUrl).toBe(url("/ok"));
});

test("gives up after more than five redirects", async () => {
  await expect(safeFetch(url("/hop?n=6"), pub())).rejects.toBeInstanceOf(FetchLimitError);
});

test("stops when the body is larger than maxBytes", async () => {
  await expect(safeFetch(url("/big"), { ...pub(), maxBytes: 1000 })).rejects.toBeInstanceOf(FetchLimitError);
});

test("stops when the server stalls past the timeout", async () => {
  await expect(safeFetch(url("/stall"), { ...pub(), timeoutMs: 300 })).rejects.toBeInstanceOf(FetchLimitError);
});

test("sends the bot user agent and caller headers", async () => {
  const res = await safeFetch(url("/echo"), { ...pub(), headers: { "If-None-Match": '"abc"' } });
  const seen = JSON.parse(res.body) as Record<string, string>;
  expect(seen["user-agent"]).toMatch(/^OzmozrBot\/1\.0/);
  expect(seen["if-none-match"]).toBe('"abc"');
  expect(seen["host"]).toBe(`public.test:${port}`);
});

test("decodes the body using the declared charset", async () => {
  expect((await safeFetch(url("/latin1"), pub())).body).toBe("café");
});

test("classifies addresses", () => {
  expect(isBlockedAddress("8.8.8.8")).toBe(false);
  expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  expect(isBlockedAddress("fd00::1")).toBe(true);
  expect(isBlockedAddress("fe80::1")).toBe(true);
  expect(isBlockedAddress("100.64.0.1")).toBe(true);
  expect(isBlockedAddress("garbage")).toBe(true);
});
