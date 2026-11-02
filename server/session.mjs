import { ACCEPT } from "./crawler.mjs";
import { parseRobots } from "./robots.mjs";

export class RobotsBlocked extends Error {
  constructor(url, reason = "disallowed by robots.txt") {
    super(`${reason}: ${url}`);
    this.name = "RobotsBlocked";
    this.reason = reason;
  }
}
const DISALLOW_ALL = parseRobots("User-agent: *\nDisallow: /");
// Waits that end early when the run is aborted.
export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
// One fetch session per run. It owns politeness for the run: robots.txt rules
// per origin, a minimum delay between requests to the same host (raised by a
// site's Crawl-delay up to 10 s), and bounded retries for transient failures.
export function createFetchSession({
  fetchPage,
  signal,
  respectRobots = true,
  politenessMs = 500,
  retryBaseMs = 1000,
  maxRetries = 2,
  log = () => {},
}) {
  const lastRequest = new Map(),
    robots = new Map();
  async function pace(host, crawlDelay) {
    const gap = Math.max(
      politenessMs,
      Math.min((crawlDelay ?? 0) * 1000, 10000),
    );
    const wait = gap - (Date.now() - (lastRequest.get(host) ?? -Infinity));
    if (wait > 0) await abortableDelay(wait, signal);
    lastRequest.set(host, Date.now());
  }
  // RFC 9309: a 4xx robots.txt allows crawling; a server error or an
  // unreachable robots.txt means the whole site is treated as disallowed.
  async function robotsFor(u) {
    if (robots.has(u.origin)) return robots.get(u.origin);
    let rules = null;
    try {
      await pace(u.host);
      const response = await fetchPage(`${u.origin}/robots.txt`, {
        signal,
        maxBytes: 512 * 1024,
        accept: ACCEPT.any,
      });
      rules = parseRobots(response.body);
    } catch (e) {
      if (signal.aborted) throw signal.reason;
      if (!(e?.status >= 400 && e?.status < 500)) {
        rules = { ...DISALLOW_ALL, unavailable: true };
        log(
          `robots.txt for ${u.origin} could not be read (${e.message}); skipping the site as RFC 9309 requires`,
        );
      }
    }
    robots.set(u.origin, rules);
    return rules;
  }
  const rulesFor = async (u) => (respectRobots ? robotsFor(u) : null);
  const blocked = (rules, u) => rules && !rules.allows(u.pathname + u.search);
  const reasonFor = (rules) =>
    rules.unavailable
      ? "robots.txt could not be read"
      : "disallowed by robots.txt";
  async function get(url, { accept = ACCEPT.html, maxBytes } = {}) {
    const u = new URL(url);
    const rules = await rulesFor(u);
    if (blocked(rules, u)) throw new RobotsBlocked(url, reasonFor(rules));
    for (let attempt = 0; ; attempt++) {
      await pace(u.host, rules?.crawlDelay);
      try {
        const response = await fetchPage(url, { signal, maxBytes, accept });
        // Redirects are followed inside the fetcher; the page that was finally
        // served must be allowed too, or it is discarded.
        if (response.url !== u.href) {
          const final = new URL(response.url);
          const finalRules = await rulesFor(final);
          if (blocked(finalRules, final))
            throw new RobotsBlocked(response.url, reasonFor(finalRules));
        }
        return response;
      } catch (e) {
        if (e instanceof RobotsBlocked) throw e;
        if (signal.aborted) throw signal.reason;
        if (!e?.retryable || attempt >= maxRetries) throw e;
        const wait = Math.min(
          e.retryAfterMs ?? retryBaseMs * 2 ** attempt,
          5000,
        );
        log(`Retrying ${url} in ${wait} ms (${e.message})`);
        await abortableDelay(wait, signal);
      }
    }
  }
  // The Sitemap: lines of the site's robots.txt (read once per site).
  get.sitemaps = async (url) => (await robotsFor(new URL(url)))?.sitemaps ?? [];
  return get;
}
