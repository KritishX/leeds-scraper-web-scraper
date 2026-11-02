// Which discovered links a crawl queues, and in what form.

// Links to files that are never HTML pages are not queued for HTML scrapers:
// each one would cost a request and a politeness wait only to be refused.
const NOT_HTML =
  /\.(?:pdf|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|heic|mp[34]|m4[av]|wav|ogg|webm|mov|avi|mkv|zip|rar|7z|gz|tgz|tar|bz2|dmg|exe|msi|apk|iso|docx?|xlsx?|pptx?|od[stp]|rtf|csv|css|js|mjs|json|xml|rss|atom|woff2?|ttf|otf|eot)$/i;
export const isLikelyHtml = (u) => !NOT_HTML.test(u.pathname);

// Tracking parameters make one page look like many; they are dropped so the
// page is fetched once.
const TRACKING =
  /^(?:utm_\w+|gclid|dclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl|yclid|ref_src)$/i;
export function canonicalLink(u) {
  const out = new URL(u.href);
  for (const name of [...out.searchParams.keys()])
    if (TRACKING.test(name)) out.searchParams.delete(name);
  out.hash = "";
  return out.href;
}

// Contact-like pages are crawled first by the contact finder.
export const CONTACT_LINK =
  /contact|about|impressum|imprint|kontakt|team|support|reach-us|get-in-touch/i;

// `*` matches any run of characters. A pattern matches anywhere in the URL
// unless it starts with a scheme, and matching ignores case. The two-pointer
// scan backtracks at most to the last `*`, so its cost is bounded by
// pattern length × URL length whatever the input.
function wildcard(pattern, text) {
  let p = 0,
    t = 0,
    star = -1,
    mark = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] !== "*" && pattern[p] === text[t]) {
      p++;
      t++;
    } else if (p < pattern.length && pattern[p] === "*") {
      star = p++;
      mark = t;
    } else if (star >= 0) {
      p = star + 1;
      t = ++mark;
    } else return false;
  }
  while (pattern[p] === "*") p++;
  return p === pattern.length;
}
export function parseUrlPatterns(value, label = "URL patterns") {
  if (value === undefined) return [];
  const lines = String(value)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length > 20) throw new Error(`${label}: use at most 20 patterns`);
  return lines.map((line) => {
    if (line.length > 200)
      throw new Error(`${label}: a pattern is longer than 200 characters`);
    const lower = line.toLowerCase();
    return /^https?:\/\//.test(lower) ? lower : `*${lower}*`;
  });
}
// A link is followed when it matches an include pattern (or there are none)
// and matches no exclude pattern.
export function linkFilter(input) {
  const include = parseUrlPatterns(input.includeUrls),
    exclude = parseUrlPatterns(input.excludeUrls);
  return (href) => {
    const url = href.toLowerCase();
    return (
      (!include.length || include.some((p) => wildcard(p, url))) &&
      !exclude.some((p) => wildcard(p, url))
    );
  };
}
