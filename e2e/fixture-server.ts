import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

const fixtures = path.join(__dirname, "../src/domain/feeds/fixtures");

/** Serves the feed fixtures on a random local port. */
export async function startFixtureServer(extra: Record<string, string> = {}): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    const name = (req.url ?? "/").slice(1);
    if (extra[name] !== undefined) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return void res.end(extra[name]);
    }
    try {
      res.end(readFileSync(path.join(fixtures, path.basename(name))));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}
