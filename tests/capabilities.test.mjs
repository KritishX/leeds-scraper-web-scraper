import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  brotliCompressSync,
  deflateRawSync,
  deflateSync,
  gzipSync,
} from "node:zlib";
import { createApplication } from "../server/index.mjs";
import { decodeContent } from "../server/crawler.mjs";
import { createFetchSession } from "../server/session.mjs";
import { extractHtml, contactDetails } from "../server/extractors.mjs";
import {
  canonicalLink,
  isLikelyHtml,
  linkFilter,
  parseUrlPatterns,
} from "../server/frontier.mjs";
import { orderedPool } from "../server/pool.mjs";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const page = (url, body = "<html><body></body></html>") => ({
  body,
  url,
  bytes: body.length,
});
const robots = (url) => url.endsWith("/robots.txt");

async function start(options) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "leeds-cap-"));
  const app = createApplication({
    dataDirectory,
    port: 0,
    timing: { politenessMs: 0, retryBaseMs: 1 },
    ...options,
  });
  const { port } = await app.listen();
  const base = `http://127.0.0.1:${port}/api`;
  const request = async (route, body) => {
    const response = await fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:4180",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const finished = async (actorId, input) => {
    const created = await request("/runs", { actorId, input });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    for (let i = 0; i < 300; i++) {
      const { run } = (await request("/runs/" + created.data.run.id)).data;
      if (!["QUEUED", "RUNNING"].includes(run.status)) return run;
      await delay(10);
    }
    assert.fail("Run did not finish");
  };
  return {
    request,
    finished,
    close: async () => {
      await app.close();
      await rm(dataDirectory, { recursive: true, force: true });
    },
  };
}

test("link patterns: wildcards, include/exclude and limits", () => {
  const follows = linkFilter({
    includeUrls: "/blog/*\n# comment\nhttps://example.com/news",
    excludeUrls: "*?page=*\n/blog/drafts/",
  });
  assert.equal(follows("https://example.com/blog/post-1"), true);
  assert.equal(follows("https://EXAMPLE.com/Blog/Post-2"), true);
  assert.equal(follows("https://example.com/news"), true);
  assert.equal(follows("https://example.com/about"), false);
  assert.equal(follows("https://example.com/blog/list?page=2"), false);
  assert.equal(follows("https://example.com/blog/drafts/x"), false);
  assert.equal(linkFilter({})("https://example.com/anything"), true);
  assert.throws(
    () => parseUrlPatterns(Array(21).fill("/a").join("\n")),
    /at most 20/,
  );
  assert.throws(() => parseUrlPatterns("/" + "a".repeat(201)), /200/);
  // Many stars against a long URL stay fast (no backtracking blow-up).
  const started = performance.now();
  linkFilter({ includeUrls: "*a*a*a*a*a*a*a*a*a*b" })(
    "https://example.com/" + "a".repeat(2000),
  );
  assert.ok(performance.now() - started < 200);
});

test("frontier: tracking parameters are dropped and file links are not pages", () => {
  assert.equal(
    canonicalLink(
      new URL("https://example.com/p?id=3&utm_source=x&fbclid=y#top"),
    ),
    "https://example.com/p?id=3",
  );
  assert.equal(
    canonicalLink(new URL("https://example.com/p?a=b%20c")),
    "https://example.com/p?a=b%20c",
  );
  assert.equal(isLikelyHtml(new URL("https://example.com/menu.PDF")), false);
  assert.equal(isLikelyHtml(new URL("https://example.com/logo.png")), false);
  assert.equal(isLikelyHtml(new URL("https://example.com/about")), true);
  assert.equal(isLikelyHtml(new URL("https://example.com/page.html")), true);
});

test("orderedPool keeps input order, bounds concurrency and stops on false", async () => {
  let running = 0,
    peak = 0;
  const seen = [];
  await orderedPool(
    [40, 10, 30, 0, 20],
    3,
    async (ms) => {
      running++;
      peak = Math.max(peak, running);
      await delay(ms);
      running--;
      return ms;
    },
    ({ value }) => {
      seen.push(value);
    },
  );
  assert.deepEqual(seen, [40, 10, 30, 0, 20]);
  assert.equal(peak, 3);
  const taken = [];
  let started = 0;
  await orderedPool(
    [1, 2, 3, 4, 5, 6],
    1,
    async (n) => {
      started++;
      return n;
    },
    ({ value }) => {
      taken.push(value);
      return value < 2;
    },
  );
  assert.deepEqual(taken, [1, 2]);
  assert.equal(started, 2);
  await assert.rejects(
    orderedPool(
      [1, 2],
      2,
      async (n) => n,
      () => {
        throw new Error("stop");
      },
    ),
    /stop/,
  );
});

test("fetch session: concurrent requests to one host stay a full gap apart and share robots.txt", async () => {
  const starts = [];
  let robotsRequests = 0;
  const get = createFetchSession({
    signal: new AbortController().signal,
    politenessMs: 80,
    fetchPage: async (url) => {
      if (robots(url)) {
        robotsRequests++;
        await delay(20);
        return page(url, "User-agent: *\nAllow: /");
      }
      starts.push(Date.now());
      return page(url);
    },
  });
  await Promise.all(
    ["a", "b", "c"].map((p) => get(`https://example.com/${p}`)),
  );
  assert.equal(robotsRequests, 1);
  starts.sort((a, b) => a - b);
  assert.ok(starts[1] - starts[0] >= 75, `gap ${starts[1] - starts[0]}`);
  assert.ok(starts[2] - starts[1] >= 75, `gap ${starts[2] - starts[1]}`);
});

test("content encodings are decoded within the byte limit", () => {
  const html = Buffer.from("<html>" + "x".repeat(5000) + "</html>");
  for (const [encoding, compress] of [
    ["gzip", gzipSync],
    ["br", brotliCompressSync],
    ["deflate", deflateSync],
    ["deflate", deflateRawSync],
  ])
    assert.deepEqual(
      decodeContent(compress(html), encoding, 1024 * 1024),
      html,
      encoding,
    );
  assert.equal(decodeContent(html, undefined, 10), html);
  assert.equal(decodeContent(html, "identity", 10), html);
  // A small body that expands past the limit is refused.
  const bomb = gzipSync(Buffer.alloc(5 * 1024 * 1024));
  assert.ok(bomb.length < 100 * 1024);
  assert.throws(
    () => decodeContent(bomb, "gzip", 1024 * 1024),
    /Decompressed response exceeds 1 MB limit/,
  );
  assert.throws(() => decodeContent(html, "zstd", 1024), /Unsupported/);
  assert.throws(() => decodeContent(html, "gzip", 1024), /not valid gzip/);
});

test("contact finder: Cloudflare-protected, obfuscated and structured contacts; file names are not emails", () => {
  // "info@example.com" encoded with key 0x42.
  const key = 0x42;
  const hex =
    key.toString(16) +
    [..."info@example.com"]
      .map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0"))
      .join("");
  const found = contactDetails(
    `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "LocalBusiness",
      address: {
        "@type": "PostalAddress",
        streetAddress: "1 Park Row",
        addressLocality: "Leeds",
        postalCode: "LS1 5AB",
        addressCountry: { name: "UK" },
      },
      contactPoint: [{ telephone: "+44 113 000 0000" }],
    })}</script></head><body>
      <span class="__cf_email__" data-cfemail="${hex}">[email&#160;protected]</span>
      <a href="/cdn-cgi/l/email-protection#${hex}">mail</a>
      <p>Write to sales [at] example [dot] co [dot] uk or hr(at)example.org</p>
      <img src="logo@2x.png" alt=""><p>logo@2x.png</p>
      <a href="TEL:%2B44%20113%20111%201111">Call</a>
      <p>me@example.net</p><p>Call us</p>
    </body></html>`,
    "https://example.com/",
  );
  assert.deepEqual(found.emails.sort(), [
    "hr@example.org",
    "info@example.com",
    "me@example.net",
    "sales@example.co.uk",
  ]);
  assert.deepEqual(found.phones.sort(), [
    "+44 113 000 0000",
    "+44 113 111 1111",
  ]);
  assert.deepEqual(found.addresses, ["1 Park Row, Leeds, LS1 5AB, UK"]);
});

test("metadata reader reports headings, word count, hreflang alternates, dates and images", () => {
  const [record] = extractHtml(
    "metadata-extractor",
    `<html lang="en"><head><title>T</title>
      <meta name="description" content="D">
      <meta property="article:published_time" content="2026-01-02">
      <link rel="alternate" hreflang="fr" href="/fr/">
    </head><body><h1>One</h1><h2>Two</h2><h2>Three</h2>
      <p>four five six</p><img src="a.png" alt="A"><img src="b.png"></body></html>`,
    "https://example.com/",
  ).records;
  assert.equal(record.description, "D");
  assert.equal(record.h1Count, 1);
  assert.deepEqual(record.h2, ["Two", "Three"]);
  assert.equal(record.wordCount, 6);
  assert.deepEqual(record.alternates, [
    { hreflang: "fr", href: "https://example.com/fr/" },
  ]);
  assert.equal(record.publishedTime, "2026-01-02");
  assert.equal(record.imageCount, 2);
  assert.equal(record.imagesWithoutAlt, 1);
});

test("product extractor: thousands separators and ProductGroup variants", () => {
  const { records } = extractHtml(
    "product-data",
    `<script type="application/ld+json">${JSON.stringify({
      "@type": "ProductGroup",
      name: "Shirt",
      brand: { name: "Acme" },
      productGroupID: "S1",
      hasVariant: [
        {
          "@type": "Product",
          sku: "S1-R",
          color: "Red",
          offers: { price: "1,299.00", priceCurrency: "NPR" },
        },
        {
          "@type": "Product",
          sku: "S1-B",
          name: "Shirt (blue)",
          color: "Blue",
          offers: { price: "12.50", priceCurrency: "NPR" },
        },
      ],
    })}</script>`,
    "https://shop.example/shirt",
  );
  assert.deepEqual(
    records.map((r) => [
      r.name,
      r.brand,
      r.sku,
      r.color,
      r.price,
      r.productGroupId,
    ]),
    [
      ["Shirt", "Acme", "S1-R", "Red", 1299, "S1"],
      ["Shirt (blue)", "Acme", "S1-B", "Blue", 12.5, "S1"],
    ],
  );
});

test("crawl: different sites are fetched in parallel, one request per site at a time", async () => {
  const active = new Map();
  let peak = 0,
    peakPerHost = 0;
  const fetchPage = async (url) => {
    if (robots(url)) return page(url, "");
    const host = new URL(url).host;
    active.set(host, (active.get(host) ?? 0) + 1);
    peakPerHost = Math.max(peakPerHost, active.get(host));
    peak = Math.max(
      peak,
      [...active.values()].reduce((a, b) => a + b, 0),
    );
    await delay(150);
    active.set(host, active.get(host) - 1);
    return page(
      url,
      `<html><head><title>${host}</title></head><body><a href="/next">n</a></body></html>`,
    );
  };
  const app = await start({ fetchPage });
  try {
    const startedAt = Date.now();
    const run = await app.finished("website-content", {
      urls: ["https://a.example/", "https://b.example/", "https://c.example/"],
      maxPages: 6,
    });
    const elapsed = Date.now() - startedAt;
    assert.equal(run.status, "SUCCEEDED");
    assert.equal(run.resultCount, 6);
    assert.equal(peakPerHost, 1);
    assert.equal(peak, 3);
    // Six pages of 150 ms on three sites: two rounds, not six.
    assert.ok(elapsed < 750, `took ${elapsed} ms`);
    assert.deepEqual(
      run.results
        .slice(0, 3)
        .map((r) => r.title)
        .sort(),
      ["a.example", "b.example", "c.example"],
    );
  } finally {
    await app.close();
  }
});

test("crawl: link patterns, tracking duplicates, file links and non-page links", async () => {
  const fetched = [];
  const home = `<html><body>
    <a href="/blog/one?utm_source=news">1</a>
    <a href="/blog/one?utm_medium=mail">1 again</a>
    <a href="/blog/two">2</a>
    <a href="/blog/menu.pdf">pdf</a>
    <a href="/blog/feed">feed (not HTML)</a>
    <a href="/blog/tag/x">tag</a>
    <a href="/shop">shop</a>
  </body></html>`;
  const fetchPage = async (url) => {
    if (robots(url)) return page(url, "");
    fetched.push(url);
    if (url.endsWith("/blog/feed"))
      throw Object.assign(new Error("Target is not an HTML page"), {
        wrongType: true,
      });
    return page(
      url,
      url.endsWith(".com/") ? home : "<html><body>x</body></html>",
    );
  };
  const app = await start({ fetchPage });
  try {
    const run = await app.finished("website-links", {
      urls: ["https://example.com/"],
      maxPages: 20,
      includeUrls: "/blog/*",
      excludeUrls: "/tag/",
    });
    assert.equal(run.status, "SUCCEEDED", run.error);
    assert.deepEqual(fetched, [
      "https://example.com/",
      "https://example.com/blog/one",
      "https://example.com/blog/two",
      "https://example.com/blog/feed",
    ]);
    assert.ok(
      run.logs.some((l) => /Skipped https:\/\/example.com\/blog\/feed/.test(l)),
    );
    const bad = await app.request("/runs", {
      actorId: "website-links",
      input: {
        urls: ["https://example.com/"],
        includeUrls: Array(21).fill("/a").join("\n"),
      },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error, /at most 20 patterns/);
  } finally {
    await app.close();
  }
});

test("crawl: the contact finder visits contact pages first and allows 100 pages", async () => {
  const fetched = [];
  const fetchPage = async (url) => {
    if (robots(url)) return page(url, "");
    fetched.push(new URL(url).pathname);
    return page(
      url,
      url.endsWith(".com/")
        ? '<a href="/a">a</a><a href="/b">b</a><a href="/contact-us">c</a>'
        : '<a href="mailto:hi@example.com">m</a>',
    );
  };
  const app = await start({ fetchPage });
  try {
    const run = await app.finished("contact-extractor", {
      urls: ["https://example.com/"],
      maxPages: 2,
    });
    assert.deepEqual(fetched, ["/", "/contact-us"]);
    assert.deepEqual(run.results[1].emails, ["hi@example.com"]);
    const accepted = await app.request("/runs", {
      actorId: "contact-extractor",
      input: { urls: ["https://example.com/"], maxPages: 100 },
    });
    assert.equal(accepted.status, 201);
    const refused = await app.request("/runs", {
      actorId: "contact-extractor",
      input: { urls: ["https://example.com/"], maxPages: 101 },
    });
    assert.equal(refused.status, 400);
  } finally {
    await app.close();
  }
});

test("local leads: websites are visited in parallel, with the contact page as a fallback", async () => {
  const fetchJson = async (url) =>
    url.includes("nominatim")
      ? [
          {
            boundingbox: ["53.7", "53.9", "-1.7", "-1.4"],
            display_name: "Leeds",
          },
        ]
      : {
          elements: ["a", "b", "c", "d"].map((name, id) => ({
            type: "node",
            id,
            lat: 1,
            lon: 2,
            tags: { name, website: `https://${name}.example/` },
          })),
        };
  let active = 0,
    peak = 0;
  const fetchPage = async (url) => {
    if (robots(url)) return page(url, "");
    active++;
    peak = Math.max(peak, active);
    await delay(60);
    active--;
    if (url === "https://a.example/")
      return page(url, '<a href="/contact">Contact</a>');
    if (url === "https://a.example/contact")
      return page(
        url,
        '<a href="mailto:office@a.example">m</a><a href="tel:+977 1 555">t</a>',
      );
    return page(url, `<a href="mailto:hello@${new URL(url).host}">m</a>`);
  };
  const app = await start({ fetchPage, fetchJson });
  try {
    const run = await app.finished("local-business-leads", {
      category: "restaurant",
      place: "Leeds",
      findEmails: true,
    });
    assert.equal(run.status, "SUCCEEDED", run.error);
    assert.ok(peak > 1, "website visits overlap");
    const [a, b] = run.results;
    assert.deepEqual(a.emails, ["office@a.example"]);
    assert.deepEqual(a.sitePhones, ["+977 1 555"]);
    assert.equal(a.contactPage, "https://a.example/contact");
    assert.deepEqual(b.emails, ["hello@b.example"]);
    assert.equal(b.contactPage, null);
  } finally {
    await app.close();
  }
});

test("social post reader keeps input order while reading posts in parallel", async () => {
  const urls = [
    "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    "https://vimeo.com/1",
    "https://example.com/not-supported",
    "https://www.reddit.com/r/x/comments/1/y/",
  ];
  let active = 0,
    peak = 0;
  const fetchJson = async (url) => {
    active++;
    peak = Math.max(peak, active);
    // Earlier posts answer later, so completion order is reversed.
    const target = new URL(url).searchParams.get("url");
    await delay(80 - urls.indexOf(target) * 20);
    active--;
    return { type: "video", title: target };
  };
  const app = await start({ fetchJson });
  try {
    const run = await app.finished("social-embeds", { urls });
    assert.equal(run.status, "SUCCEEDED", run.error);
    assert.ok(peak > 1);
    assert.deepEqual(
      run.results.map((r) => r.title),
      [urls[0], urls[1], urls[3]],
    );
    assert.ok(run.logs.some((l) => /unsupported provider/.test(l)));
  } finally {
    await app.close();
  }
});
