import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../server/index.mjs";
const origin = "http://127.0.0.1:4180";
const ld = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const video = {
  id: "12345",
  desc: "Fixture public video",
  author: { uniqueId: "business" },
  stats: { diggCount: 3 },
};

test("nine independent scraper APIs execute real workers against controlled public-page/API fixtures", async () => {
  const dataDirectory = await mkdtemp(
    path.join(tmpdir(), "leeds-platform-api-"),
  );
  let blocked = false,
    budgetCalls = 0;
  const app = createApplication({
    dataDirectory,
    port: 0,
    timing: { politenessMs: 0, retryBaseMs: 1 },
    googleSources: {
      googleMapsKey: "test-key",
      googleSearchKey: "test-key",
      googleSearchEngineId: "test-engine",
      youtubeKey: "test-key",
    },
    fetchPage: async (url) => ({
      url,
      body: url.endsWith("/robots.txt")
        ? `User-agent: *\n${blocked ? "Disallow: /" : "Allow: /"}`
        : url.includes("tiktok.com")
          ? `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: video } }, "webapp.search": { itemList: [video] } } })}</script>`
          : url.includes("facebook.com")
            ? ld({
                "@type": "SocialMediaPosting",
                headline: "Fixture public business post",
              })
            : url.includes("/reel/")
              ? ld({ "@type": "VideoObject", name: "Fixture Reel" })
              : ld({
                  "@type": "ProfilePage",
                  mainEntity: {
                    "@type": "Organization",
                    name: "Fixture Business",
                  },
                }),
    }),
    fetchJson: async (url, options) => {
      const u = new URL(url);
      if (
        u.hostname === "customsearch.googleapis.com" &&
        u.searchParams.get("q") === "budget fixture"
      ) {
        budgetCalls++;
        options.onBytes(5 * 1024 * 1024);
        return {
          items: [
            {
              title: "Budget fixture",
              link: `https://example.com/${budgetCalls}`,
            },
          ],
          queries: {
            nextPage: [{ startIndex: Number(u.searchParams.get("start")) + 1 }],
          },
        };
      }
      return url.includes("places.googleapis.com")
        ? {
            places: [
              {
                id: "p1",
                displayName: { text: "Fixture Place" },
                googleMapsUri: "https://www.google.com/maps/place/fixture",
              },
            ],
          }
        : url.includes("customsearch.googleapis.com")
          ? {
              items: [
                {
                  title: "Fixture result",
                  link: "https://example.com/result",
                  snippet: "Fixture snippet",
                },
              ],
            }
          : url.includes("/search?")
            ? { items: [{ id: { videoId: "dQw4w9WgXcQ" } }] }
            : url.includes("/videos?")
              ? {
                  items: [
                    {
                      id: "dQw4w9WgXcQ",
                      snippet: { title: "Fixture Video" },
                      statistics: { viewCount: "42" },
                    },
                  ],
                }
              : { items: [] };
    },
  });
  const { port } = await app.listen();
  const base = `http://127.0.0.1:${port}/api`;
  const request = async (route, body) => {
    const r = await fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: body
        ? { "Content-Type": "application/json", Origin: origin }
        : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  const finish = async (id) => {
    for (let i = 0; i < 100; i++) {
      const { data } = await request("/runs/" + id);
      if (!["QUEUED", "RUNNING"].includes(data.run.status)) return data.run;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail("Worker deadline");
  };
  try {
    const inputs = {
      "tiktok-scraper": {
        urls: ["https://www.tiktok.com/@business/video/12345"],
      },
      "instagram-scraper": { urls: ["https://www.instagram.com/p/test/"] },
      "instagram-profile": { urls: ["https://www.instagram.com/business/"] },
      "instagram-reel": { urls: ["https://www.instagram.com/reel/test/"] },
      "facebook-search-posts": { query: "public bakery" },
      "tiktok-search": { query: "public bakery" },
      "google-maps-scraper": { query: "bakery Kathmandu" },
      "google-search-scraper": { query: "bakery Nepal" },
      "youtube-scraper": { query: "Nepal business" },
    };
    for (const [actorId, input] of Object.entries(inputs)) {
      const { status, data } = await request("/runs", { actorId, input });
      assert.equal(status, 201, JSON.stringify(data));
      const run = await finish(data.run.id);
      assert.equal(run.status, "SUCCEEDED", `${actorId}: ${run.error}`);
      assert.equal(run.resultCount, 1, actorId);
      assert.ok(run.results[0].sourceUrl);
      assert.ok(run.results[0].collectedAt);
      assert.doesNotMatch(JSON.stringify(run), /test-key/);
    }
    blocked = true;
    const { data } = await request("/runs", {
      actorId: "instagram-profile",
      input: { urls: ["https://www.instagram.com/business/"] },
    });
    const run = await finish(data.run.id);
    assert.equal(run.status, "FAILED");
    assert.equal(run.resultCount, 0);
    assert.match(run.error, /robots/);
    const budgetRun = await request("/runs", {
      actorId: "google-search-scraper",
      input: { query: "budget fixture" },
    });
    const stopped = await finish(budgetRun.data.run.id);
    assert.equal(stopped.status, "FAILED");
    assert.equal(stopped.resultCount, 4);
    assert.equal(budgetCalls, 4);
    assert.match(stopped.error, /download budget/);
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
