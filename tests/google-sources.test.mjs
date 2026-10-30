import test from "node:test";
import assert from "node:assert/strict";
import {
  runGoogleMaps,
  runGoogleSearch,
  runYouTube,
  createGoogleSourceRunners,
} from "../server/google-sources.mjs";

function context(input, fetchJson) {
  const records = [],
    logs = [];
  return {
    input,
    fetchJson,
    signal: new AbortController().signal,
    timeLeft: () => 60000,
    push: (record) => {
      records.push(record);
      return true;
    },
    log: (line) => logs.push(line),
    records,
    logs,
  };
}
test("Google source configuration gates make no requests", async () => {
  let requests = 0;
  const ctx = context({ query: "shops", limit: 1 }, async () => {
    requests++;
  });
  await assert.rejects(runGoogleMaps(ctx), /LEEDS_GOOGLE_MAPS_API_KEY/);
  await assert.rejects(runGoogleSearch(ctx), /existing eligible/);
  await assert.rejects(runYouTube(ctx), /LEEDS_YOUTUBE_API_KEY/);
  assert.equal(requests, 0);
  assert.equal(Object.keys(createGoogleSourceRunners()).length, 3);
});
test("Maps follows pages, de-duplicates places, preserves phones and never puts key in URL", async () => {
  const calls = [];
  const ctx = context(
    { query: "shops Kathmandu", limit: 2 },
    async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? {
            places: [
              {
                id: "a",
                displayName: { text: "Shop A" },
                internationalPhoneNumber: "+977 9800000001",
                websiteUri: "http://127.0.0.1/private",
              },
            ],
            nextPageToken: "next",
          }
        : {
            places: [
              { id: "a" },
              { id: "b", displayName: { text: "Shop B" }, rating: 0 },
            ],
          };
    },
  );
  assert.deepEqual(await runGoogleMaps(ctx, { googleMapsKey: "secret" }), {
    failures: 0,
  });
  assert.equal(ctx.records.length, 2);
  assert.equal(ctx.records[0].phone, "+977 9800000001");
  assert.equal(ctx.records[0].website, null);
  assert.equal(ctx.records[1].rating, 0);
  assert.equal(ctx.records[1].phone, null);
  assert.equal(calls[0].options.headers["X-Goog-Api-Key"], "secret");
  assert.ok(!calls[0].url.includes("secret"));
  assert.equal(JSON.parse(calls[1].options.body).pageToken, "next");
  assert.ok(
    ctx.records.every(
      (r) =>
        r.sourceUrl.startsWith("https://www.google.com/maps/") && r.collectedAt,
    ),
  );
});
test("Maps no results differs from API error; credentials never reach thrown errors", async () => {
  const empty = context({ query: "shops" }, async () => ({}));
  await runGoogleMaps(empty, { googleMapsKey: "secret" });
  assert.match(empty.logs[0], /No matching/);
  const failed = context({ query: "shops" }, async () => {
    throw new Error("https://example.com/?key=secret");
  });
  await assert.rejects(
    runGoogleMaps(failed, { googleMapsKey: "secret" }),
    (e) => /request failed/.test(e.message) && !e.message.includes("secret"),
  );
  const invalid = context({ query: "shops" }, async () => ({ places: {} }));
  await assert.rejects(
    runGoogleMaps(invalid, { googleMapsKey: "secret" }),
    /invalid places/,
  );
});
test("Google search paginates, skips private and duplicate links, caps text", async () => {
  let calls = 0;
  const ctx = context(
    { query: "Nepal dairy", limit: 3 },
    async (url, options) => {
      const u = new URL(url);
      assert.equal(u.searchParams.has("key"), false);
      assert.equal(options.headers["X-Goog-Api-Key"], "secret");
      calls++;
      return calls === 1
        ? {
            items: [
              {
                link: "https://dairy.example/",
                title: "a".repeat(2000),
                snippet: "Phone on public website",
              },
              { link: "http://localhost/private" },
            ],
            queries: { nextPage: [{ startIndex: 3 }] },
          }
        : {
            items: [
              { link: "https://dairy.example/" },
              { link: "https://other.example/", title: "Other" },
            ],
          };
    },
  );
  await runGoogleSearch(ctx, {
    googleSearchKey: "secret",
    googleSearchEngineId: "engine",
  });
  assert.equal(calls, 2);
  assert.equal(ctx.records.length, 2);
  assert.equal(ctx.records[0].title.length, 1000);
  assert.equal(ctx.records[1].rank, 4);
  assert.ok(!JSON.stringify(ctx.records).includes("secret"));
});
test("Search sanitizes API error bodies", async () => {
  const ctx = context({ query: "business" }, async () => ({
    error: { code: 403, message: "secret denied" },
  }));
  await assert.rejects(
    runGoogleSearch(ctx, {
      googleSearchKey: "secret",
      googleSearchEngineId: "engine",
    }),
    (e) => e.message.includes("403") && !e.message.includes("secret"),
  );
});
test("YouTube URL-only oEmbed works without key and rejects non-video/private URLs", async () => {
  let requests = 0;
  const ctx = context(
    {
      urls: [
        "https://youtu.be/abcdefghijk?t=4",
        "https://www.youtube.com/watch?v=abcdefghijk",
        "https://youtube.com.evil.example/watch?v=abcdefghijk",
        "http://localhost/watch?v=abcdefghijk",
      ],
      limit: 10,
    },
    async (url) => {
      requests++;
      assert.equal(new URL(url).origin, "https://www.youtube.com");
      return {
        title: "A public video",
        author_name: "Business",
        author_url: "https://www.youtube.com/@business",
        thumbnail_url: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
      };
    },
  );
  assert.deepEqual(await runYouTube(ctx), { failures: 2 });
  assert.equal(requests, 1);
  assert.equal(ctx.records[0].views, null);
  assert.equal(
    ctx.records[0].sourceUrl,
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
});
test("YouTube keyword search expands official video and channel metrics", async () => {
  const methods = [];
  const ctx = context(
    { query: "Nepal dairy", limit: 1 },
    async (url, options) => {
      assert.equal(options.headers["X-Goog-Api-Key"], "secret");
      assert.ok(!url.includes("secret"));
      const method = new URL(url).pathname.split("/").at(-1);
      methods.push(method);
      if (method === "search")
        return { items: [{ id: { videoId: "abcdefghijk" } }] };
      if (method === "videos")
        return {
          items: [
            {
              id: "abcdefghijk",
              snippet: {
                title: "Dairy",
                channelId: "UC_business",
                channelTitle: "Business",
              },
              statistics: { viewCount: "120", likeCount: "0" },
              contentDetails: { duration: "PT2M" },
            },
          ],
        };
      return {
        items: [
          {
            id: "UC_business",
            statistics: {
              subscriberCount: "1000",
              hiddenSubscriberCount: true,
              videoCount: "25",
            },
          },
        ],
      };
    },
  );
  await runYouTube(ctx, { youtubeKey: "secret" });
  assert.deepEqual(methods, ["search", "videos", "channels"]);
  assert.equal(ctx.records[0].views, 120);
  assert.equal(ctx.records[0].likes, 0);
  assert.equal(ctx.records[0].comments, null);
  assert.equal(ctx.records[0].subscriberCount, null);
  assert.equal(ctx.records[0].channelVideoCount, 25);
});
test("Cancellation prevents outgoing calls", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Cancelled"));
  const ctx = context({ query: "shops" }, async () =>
    assert.fail("fetch after cancellation"),
  );
  ctx.signal = controller.signal;
  await assert.rejects(
    runGoogleSearch(ctx, {
      googleSearchKey: "secret",
      googleSearchEngineId: "engine",
    }),
    /Cancelled/,
  );
});
test("YouTube unavailable videos count as failures, not invented records", async () => {
  const ctx = context({ urls: ["https://youtu.be/abcdefghijk"] }, async () => ({
    items: [],
  }));
  assert.deepEqual(await runYouTube(ctx, { youtubeKey: "secret" }), {
    failures: 1,
  });
  assert.equal(ctx.records.length, 0);
});
