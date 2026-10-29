import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePublicPlatform,
  runPublicPlatform,
  validatePlatformUrl,
} from "../server/platforms.mjs";

const video = {
  id: "123",
  desc: "A public bakery video",
  author: { uniqueId: "bakery", nickname: "Bakery" },
  stats: { diggCount: 0, playCount: 42 },
  createTime: 1700000000,
};
const ttUrl = "https://www.tiktok.com/@bakery/video/123";
const igUrl = "https://www.instagram.com/reel/abc/";
const script = (id, data) =>
  `<script id="${id}" type="application/json">${JSON.stringify(data)}</script>`;
const ld = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const tt = script("__UNIVERSAL_DATA_FOR_REHYDRATION__", {
  __DEFAULT_SCOPE__: {
    "webapp.video-detail": { itemInfo: { itemStruct: video } },
  },
});

test("TikTok reads public hydration, retains zero counts and unknowns", () => {
  const [record] = parsePublicPlatform("tiktok-scraper", tt, ttUrl);
  assert.equal(record.id, "123");
  assert.equal(record.likes, 0);
  assert.equal(record.comments, null);
  assert.equal(record.followers, null);
  assert.equal(record.sourceUrl, ttUrl);
  assert.ok(record.collectedAt);
  assert.equal(record.extractionMode, "public-embedded-json");
  const sigi = script("SIGI_STATE", { ItemModule: { 123: video } });
  assert.equal(parsePublicPlatform("tiktok-scraper", sigi, ttUrl)[0].views, 42);
});

test("TikTok public profile has only stated statistics", () => {
  const data = script("__UNIVERSAL_DATA_FOR_REHYDRATION__", {
    __DEFAULT_SCOPE__: {
      "webapp.user-detail": {
        userInfo: {
          user: { uniqueId: "bakery", nickname: "Bakery" },
          stats: { followerCount: 10 },
        },
      },
    },
  });
  const [record] = parsePublicPlatform(
    "tiktok-scraper",
    data,
    "https://www.tiktok.com/@bakery",
  );
  assert.equal(record.followers, 10);
  assert.equal(record.likes, null);
});

test("Instagram supports JSON-LD reels and profile entities", () => {
  const html = ld({
    "@type": "VideoObject",
    name: "Bakery reel",
    description: "Baking",
    uploadDate: "2025-01-01",
    thumbnailUrl: ["https://example.com/image.jpg"],
  });
  const [record] = parsePublicPlatform("instagram-reel", html, igUrl);
  assert.equal(record.name, "Bakery reel");
  assert.equal(record.imageUrl, "https://example.com/image.jpg");
  assert.equal(record.views, null);
  const profile = ld({
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Organization",
      name: "Bakery",
      description: "Public bakery",
    },
  });
  assert.equal(
    parsePublicPlatform(
      "instagram-profile",
      profile,
      "https://www.instagram.com/bakery/",
    )[0].name,
    "Bakery",
  );
});

test("metadata fallback is explicit and never guesses followers", () => {
  const html =
    '<meta property="og:title" content="Bakery"><meta property="og:description" content="10K Followers, 20K Likes">';
  for (const [actor, url] of [
    ["instagram-scraper", igUrl],
    ["tiktok-scraper", ttUrl],
  ]) {
    const [record] = parsePublicPlatform(actor, html, url);
    assert.equal(record.extractionMode, "public-page-metadata");
    assert.equal(record.followers, null);
    assert.equal(record.likes, null);
  }
});

test("search needs embedded search records, not post data or OG fallback", () => {
  const url = "https://www.tiktok.com/search?q=bakery";
  assert.throws(
    () => parsePublicPlatform("tiktok-search", tt, url),
    /No supported public/,
  );
  const data = script("__UNIVERSAL_DATA_FOR_REHYDRATION__", {
    __DEFAULT_SCOPE__: { "webapp.search": { data: [{ item: video }] } },
  });
  assert.equal(parsePublicPlatform("tiktok-search", data, url)[0].id, "123");
  const fb = ld({
    "@type": "ItemList",
    itemListElement: [
      {
        "@type": "ListItem",
        item: {
          "@type": "SocialMediaPosting",
          headline: "Bakery public post",
          articleBody: "Today baking",
        },
      },
      { item: { "@type": "Person", name: "Ignore person" } },
    ],
  });
  const records = parsePublicPlatform(
    "facebook-search-posts",
    fb,
    "https://www.facebook.com/search/posts/?q=bakery",
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Bakery public post");
});

test("host, path, credentials, unknown actor and search post rejection", () => {
  for (const url of [
    "https://instagram.com.evil.test/bakery/",
    "https://user:pass@instagram.com/bakery/",
    "https://instagram.com/accounts/login/",
    "https://instagram.com/direct/",
    "https://instagram.com:8443/bakery/",
  ])
    assert.throws(() => validatePlatformUrl("instagram-scraper", url));
  assert.throws(() => validatePlatformUrl("unknown", ttUrl));
  assert.throws(() => validatePlatformUrl("tiktok-search", ttUrl));
  assert.throws(() =>
    validatePlatformUrl(
      "facebook-search-posts",
      "https://www.facebook.com/search/people/?q=someone",
    ),
  );
});

test("login/challenge and hostile JSON are real failures", () => {
  for (const html of [
    "<title>Login • Instagram</title>",
    '<input name="password">',
    "<title>Just a moment...</title>",
    '<script id="SIGI_STATE">{"ItemModule":</script>',
    `<script id="SIGI_STATE">${"[".repeat(10000)}${"]".repeat(10000)}</script>`,
    '<script id="SIGI_STATE">{"__proto__":{"polluted":true}}</script>',
  ])
    assert.throws(() => parsePublicPlatform("tiktok-scraper", html, ttUrl));
  assert.equal({}.polluted, undefined);
  assert.throws(
    () =>
      parsePublicPlatform(
        "tiktok-scraper",
        "x".repeat(2 * 1024 * 1024 + 1),
        ttUrl,
      ),
    /exceeds/,
  );
});

test("runner keeps real partial results and rejects wrong-host redirects", async () => {
  const records = [],
    logs = [];
  const result = await runPublicPlatform({
    actorId: "tiktok-scraper",
    input: { urls: [ttUrl, "https://www.tiktok.com/@other"] },
    signal: new AbortController().signal,
    getPage: async (url) =>
      url === ttUrl
        ? { url, body: tt }
        : { url: "https://example.com/", body: tt },
    push: (r) => records.push(r),
    log: (x) => logs.push(x),
  });
  assert.deepEqual(result, { pages: 1, records: 1, failures: 1 });
  assert.equal(records.length, 1);
  assert.equal(logs.length, 1);
  await assert.rejects(
    runPublicPlatform({
      actorId: "tiktok-scraper",
      input: { urls: [ttUrl] },
      signal: new AbortController().signal,
      getPage: async () => ({
        url: "https://www.instagram.com/accounts/login/",
        body: tt,
      }),
      push: () => {},
    }),
    /No public platform records/,
  );
});

test("runner limits and cancellation stop fetches and writes", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort(new Error("stop run"));
  await assert.rejects(
    runPublicPlatform({
      actorId: "tiktok-scraper",
      input: { urls: [ttUrl] },
      signal: controller.signal,
      getPage: async () => {
        calls++;
      },
      push: () => {},
    }),
    /stop run/,
  );
  assert.equal(calls, 0);
  const active = new AbortController();
  await assert.rejects(
    runPublicPlatform({
      actorId: "tiktok-scraper",
      input: { urls: [ttUrl] },
      signal: active.signal,
      getPage: async () => {
        active.abort(new Error("cancel after fetch"));
        return { url: ttUrl, body: tt };
      },
      push: () => {
        throw new Error("should not write");
      },
    }),
    /cancel after fetch/,
  );
  await assert.rejects(
    runPublicPlatform({
      actorId: "tiktok-scraper",
      input: { urls: Array(51).fill(ttUrl) },
      signal: active.signal,
    }),
    /between 1 and 50/,
  );
});

test("search runners route keyword to visible public URL and propagate robots block", async () => {
  for (const [actorId, expected] of [
    ["tiktok-search", "https://www.tiktok.com/search?q=nepal+bakery"],
    [
      "facebook-search-posts",
      "https://www.facebook.com/search/posts/?q=nepal+bakery",
    ],
  ]) {
    let requested;
    await assert.rejects(
      runPublicPlatform({
        actorId,
        input: { query: "nepal bakery" },
        signal: new AbortController().signal,
        getPage: async (url) => {
          requested = url;
          throw new Error("disallowed by robots.txt");
        },
        push: () => {
          throw new Error("must not write");
        },
      }),
      /disallowed by robots.txt/,
    );
    assert.equal(requested, expected);
  }
});
