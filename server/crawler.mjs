import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { gunzipSync } from "node:zlib";
import { isIP } from "node:net";

export function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function validateUrl(value) {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("A public HTTP(S) URL is required");
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error("Invalid URL");
  }
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port)) ||
    u.hostname.includes(":")
  )
    throw new Error("Only public HTTP(S) URLs on standard ports are supported");
  if (isIP(u.hostname) && !isPublicIPv4(u.hostname))
    throw new Error("Private and reserved network addresses are blocked");
  if (
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    u.hostname.endsWith(".local") ||
    !u.hostname.includes(".")
  )
    throw new Error("Private network names are blocked");
  u.hash = "";
  return u;
}
export async function publicAddress(u) {
  const answers = await lookup(u.hostname, { all: true, family: 4 });
  if (!answers.length || answers.some((x) => !isPublicIPv4(x.address)))
    throw new Error("Target resolves to a private or reserved network address");
  return answers[0].address;
}
export const USER_AGENT =
  "LeedsHarvester/0.2 (+https://github.com/KritishX/leeds-harvester-web-scraper)";
// What each kind of request accepts; a response of another type is refused
// before its body is read.
export const ACCEPT = {
  html: {
    header: "text/html,application/xhtml+xml",
    type: /text\/html|application\/xhtml\+xml/i,
    label: "an HTML page",
  },
  feed: {
    header:
      "application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.9,application/gzip;q=0.8",
    type: /xml|gzip/i,
    label: "an XML feed or sitemap",
    gzip: true,
  },
  text: { header: "text/plain", type: /^text\//i, label: "a text file" },
  json: { header: "application/json", type: /json/i, label: "a JSON response" },
  // robots.txt is read whatever Content-Type the server labels it with.
  any: { header: "text/plain,*/*;q=0.5", type: /(?:)/, label: "a file" },
};
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
]);
// A failed request says whether trying again could help, so callers retry
// throttling and transient faults but never a refused or oversized response.
export class FetchError extends Error {
  constructor(
    message,
    {
      status = null,
      retryable = false,
      retryAfterMs = null,
      wrongType = false,
    } = {},
  ) {
    super(message);
    this.name = "FetchError";
    this.wrongType = wrongType;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
function retryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}
// The charset comes from the Content-Type header, else from a <meta> tag or the
// XML declaration within the first 1 KB, else UTF-8.
export function decodeBody(buffer, contentType) {
  const head = buffer.subarray(0, 1024).toString("latin1");
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType || "")?.[1] ??
    /<meta[^>]{0,200}?charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    /<\?xml[^>]{0,200}?encoding=["']([\w-]+)/i.exec(head)?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}
// A gzip body (detected by its magic bytes, e.g. sitemap.xml.gz) is unpacked
// with the same byte limit as the download, so a small file cannot expand
// without bound. Other bodies pass through unchanged.
export function gunzipWithin(buffer, maxBytes) {
  if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) return buffer;
  try {
    return gunzipSync(buffer, { maxOutputLength: maxBytes });
  } catch (e) {
    throw new FetchError(
      e.code === "ERR_BUFFER_TOO_LARGE"
        ? `Decompressed response exceeds ${sizeLabel(maxBytes)} limit`
        : "Response is not valid gzip data",
    );
  }
}
const sizeLabel = (bytes) =>
  bytes >= 1024 * 1024
    ? `${Math.round(bytes / 1024 / 1024)} MB`
    : `${Math.round(bytes / 1024)} KB`;
// Fetches one public resource. Every hop (including redirects) is validated,
// resolved to public IPv4 addresses only, and pinned to the checked address.
export async function fetchPublicResource(
  value,
  {
    signal,
    maxBytes = 2 * 1024 * 1024,
    accept = ACCEPT.html,
    method = "GET",
    headers = {},
    body,
    timeoutMs = 15000,
  } = {},
) {
  let u = validateUrl(value);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const address = await publicAddress(u);
    const response = await new Promise((resolve, reject) => {
      const request = (u.protocol === "https:" ? https : http).request(
        u,
        {
          method,
          signal,
          // One socket per request: no pooled socket outlives a rejected response.
          agent: false,
          timeout: timeoutMs,
          lookup: (_host, opts, cb) =>
            cb(null, opts?.all ? [{ address, family: 4 }] : address, 4),
          headers: {
            "User-Agent": USER_AGENT,
            Accept: accept.header,
            ...headers,
            ...(body === undefined
              ? {}
              : { "Content-Length": Buffer.byteLength(body) }),
          },
        },
        (res) => {
          // Unused bodies are discarded by closing the socket, never drained.
          const discard = (error, result) => {
            res.destroy();
            if (error) reject(error);
            else resolve(result);
          };
          const status = res.statusCode;
          if ([301, 302, 303, 307, 308].includes(status)) {
            if (method !== "GET")
              discard(new FetchError(`Unexpected redirect (HTTP ${status})`));
            else if (!res.headers.location)
              discard(new FetchError("Redirect is missing a Location header"));
            else discard(null, { redirect: res.headers.location });
            return;
          }
          if (status < 200 || status >= 300) {
            discard(
              new FetchError(`HTTP ${status}`, {
                status,
                retryable: RETRYABLE_STATUS.has(status),
                retryAfterMs: retryAfter(res.headers["retry-after"]),
              }),
            );
            return;
          }
          const contentType = res.headers["content-type"] || "";
          if (!accept.type.test(contentType)) {
            discard(
              new FetchError(`Target is not ${accept.label}`, {
                wrongType: true,
              }),
            );
            return;
          }
          if (Number(res.headers["content-length"]) > maxBytes) {
            discard(
              new FetchError(`Response exceeds ${sizeLabel(maxBytes)} limit`),
            );
            return;
          }
          let size = 0;
          const chunks = [];
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxBytes)
              res.destroy(
                new FetchError(`Response exceeds ${sizeLabel(maxBytes)} limit`),
              );
            else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("close", () => {
            if (!res.complete)
              reject(
                new FetchError(
                  "Connection closed before the response completed",
                  {
                    retryable: true,
                  },
                ),
              );
          });
          res.on("end", () => {
            let raw = Buffer.concat(chunks);
            try {
              if (accept.gzip) raw = gunzipWithin(raw, maxBytes);
            } catch (error) {
              reject(error);
              return;
            }
            // `bytes` stays the downloaded (compressed) size for run budgets.
            resolve({
              body: decodeBody(raw, contentType),
              url: u.href,
              bytes: size,
              contentType,
              status,
            });
          });
        },
      );
      request.on("timeout", () =>
        request.destroy(
          new FetchError("Request timed out", { retryable: true }),
        ),
      );
      request.on("error", (e) =>
        reject(
          RETRYABLE_CODES.has(e.code)
            ? new FetchError(e.message, { retryable: true })
            : e,
        ),
      );
      request.end(body);
    });
    if (response.redirect) {
      const next = validateUrl(new URL(response.redirect, u).href);
      if (
        next.origin !== u.origin &&
        Object.keys(headers).some((name) =>
          /^(authorization|proxy-authorization|cookie|x-goog-api-key)$/i.test(
            name,
          ),
        )
      )
        throw new FetchError(
          "Credential-bearing requests cannot redirect to another origin",
        );
      u = next;
      continue;
    }
    return response;
  }
  throw new FetchError("Redirect limit exceeded");
}
export async function fetchPublicJson(url, options = {}) {
  const response = await fetchPublicResource(url, {
    maxBytes: 5 * 1024 * 1024,
    ...options,
    accept: ACCEPT.json,
  });
  options.onBytes?.(response.bytes);
  try {
    return JSON.parse(response.body);
  } catch {
    throw new FetchError("Response is not valid JSON");
  }
}
