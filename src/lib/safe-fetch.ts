import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

export class UnsafeUrlError extends Error {
  override name = "UnsafeUrlError";
}
export class FetchLimitError extends Error {
  override name = "FetchLimitError";
}

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type SafeFetchOptions = {
  headers?: Record<string, string>;
  /** Largest decoded body accepted. Default 5,000,000 bytes. */
  maxBytes?: number;
  /** Deadline for the whole exchange, redirects included. Default 15,000 ms. */
  timeoutMs?: number;
  /** DNS lookup, replaceable in tests. */
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  /** Hostnames exempt from the private-address check. For tests only. */
  allowPrivateHosts?: string[];
};

export type SafeFetchResult = { status: number; headers: Headers; body: string; finalUrl: string };

const USER_AGENT = "OzmozrBot/1.0 (+feed reader)";
const MAX_REDIRECTS = 5;

const blocked = new net.BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(prefix, bits, "ipv4");
}
for (const [prefix, bits] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) {
  blocked.addSubnet(prefix, bits, "ipv6");
}

/** True for loopback, private, link-local, reserved and unparseable addresses. */
export function isBlockedAddress(address: string): boolean {
  if (net.isIPv4(address)) return blocked.check(address, "ipv4");
  if (net.isIPv6(address)) {
    const mapped = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(address);
    if (mapped) {
      if (mapped[1]) return isBlockedAddress(mapped[1]);
      const hi = parseInt(mapped[2]!, 16);
      const lo = parseInt(mapped[3]!, 16);
      return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return blocked.check(address, "ipv6");
  }
  return true;
}

function privateFetchAllowed(): boolean {
  return process.env.OZMOZR_ALLOW_PRIVATE_FETCH === "1" && process.env.NODE_ENV !== "production";
}

async function defaultResolve(hostname: string): Promise<ResolvedAddress[]> {
  const found = await dns.lookup(hostname, { all: true, verbatim: true });
  return found.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
}

/** Resolves a URL's host and returns the single vetted address to connect to. */
async function vet(url: URL, opts: SafeFetchOptions): Promise<ResolvedAddress> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Only http and https addresses can be fetched`);
  }
  if (url.username || url.password) throw new UnsafeUrlError("Addresses with embedded credentials are not allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: ResolvedAddress[];
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  } else {
    try {
      addresses = await (opts.resolve ?? defaultResolve)(hostname);
    } catch {
      throw new UnsafeUrlError(`Could not find the server ${hostname}`);
    }
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`Could not find the server ${hostname}`);
  const exempt = privateFetchAllowed() || (opts.allowPrivateHosts ?? []).includes(hostname);
  if (!exempt && addresses.some((a) => isBlockedAddress(a.address))) {
    throw new UnsafeUrlError("That address points to a private or local network");
  }
  return addresses[0]!;
}

function decoded(res: http.IncomingMessage): Readable {
  const encoding = (res.headers["content-encoding"] ?? "").toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return res.pipe(zlib.createGunzip());
  if (encoding === "deflate") return res.pipe(zlib.createInflate());
  if (encoding === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function decodeBody(bytes: Buffer, contentType: string | undefined): string {
  const declared =
    /charset\s*=\s*"?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /^<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(bytes.subarray(0, 200).toString("latin1"))?.[1];
  try {
    return new TextDecoder(declared ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value !== undefined) headers.set(key, value);
  }
  return headers;
}

type Hop = { status: number; headers: http.IncomingHttpHeaders; bytes: Buffer };

function requestOnce(
  url: URL,
  target: ResolvedAddress,
  headers: Record<string, string>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    // Connect to the address we vetted, so a second DNS answer cannot differ.
    const lookup: net.LookupFunction = (_host, options, callback) => {
      if (typeof options === "object" && options.all) {
        (callback as (e: null, a: ResolvedAddress[]) => void)(null, [target]);
      } else {
        callback(null, target.address, target.family);
      }
    };
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup,
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          ...headers,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if ((status >= 300 && status < 400) || status === 304) {
          res.resume();
          return resolve({ status, headers: res.headers, bytes: Buffer.alloc(0) });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const stream = decoded(res);
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new FetchLimitError(`The response is larger than ${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, headers: res.headers, bytes: Buffer.concat(chunks) }));
        stream.on("error", reject);
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetches a user-supplied URL without letting it reach private networks, hang,
 * or return an unbounded body. Throws UnsafeUrlError or FetchLimitError.
 */
export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("That is not a valid web address");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    for (let redirects = 0; ; redirects++) {
      const target = await vet(url, opts);
      let hop: Hop;
      try {
        hop = await requestOnce(url, target, opts.headers ?? {}, maxBytes, controller.signal);
      } catch (err) {
        if (timedOut) throw new FetchLimitError(`The server took longer than ${timeoutMs} ms`);
        throw err;
      }
      const location = hop.headers.location;
      if (hop.status >= 300 && hop.status < 400 && hop.status !== 304 && location) {
        if (redirects >= MAX_REDIRECTS) throw new FetchLimitError("Too many redirects");
        try {
          url = new URL(location, url);
        } catch {
          throw new UnsafeUrlError("The server redirected to an invalid address");
        }
        continue;
      }
      return {
        status: hop.status,
        headers: toHeaders(hop.headers),
        body: decodeBody(hop.bytes, hop.headers["content-type"]),
        finalUrl: url.href,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
