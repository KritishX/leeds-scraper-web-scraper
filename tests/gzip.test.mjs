import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import https from "node:https";
import { gzipSync } from "node:zlib";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ACCEPT,
  fetchPublicResource,
  gunzipWithin,
} from "../server/crawler.mjs";
import { createApplication } from "../server/index.mjs";

const MB = 1024 * 1024;
const urlset = (...locs) =>
  `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;

// Serves `body` for every request through the real fetcher; DNS and HTTPS
// are mocked, so nothing reaches the network.
function serve(t, body, contentType) {
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  syncBuiltinESMExports();
  t.mock.method(https, "request", (_url, _options, callback) => {
    const request = new EventEmitter();
    request.end = () =>
      queueMicrotask(() => {
        const response = new PassThrough();
        response.complete = true;
        response.statusCode = 200;
        response.headers = { "content-type": contentType };
        callback(response);
        response.end(body);
      });
    request.destroy = () => {};
    return request;
  });
}

test("a .xml.gz sitemap is unpacked; the budget counts compressed bytes", async (t) => {
  const xml = urlset("https://example.com/a", "https://example.com/b");
  const gz = gzipSync(xml);
  serve(t, gz, "application/x-gzip");
  const page = await fetchPublicResource("https://example.com/sitemap.xml.gz", {
    accept: ACCEPT.feed,
    maxBytes: 10 * MB,
  });
  assert.equal(page.body, xml);
  assert.equal(page.bytes, gz.length);
});

test("a gzip bomb is refused once it expands past the file limit", async (t) => {
  const bomb = gzipSync(Buffer.alloc(11 * MB));
  assert.ok(bomb.length < 64 * 1024);
  serve(t, bomb, "application/gzip");
  await assert.rejects(
    fetchPublicResource("https://example.com/sitemap.xml.gz", {
      accept: ACCEPT.feed,
      maxBytes: 10 * MB,
    }),
    /Decompressed response exceeds 10 MB limit/,
  );
  assert.throws(
    () => gunzipWithin(Buffer.from([0x1f, 0x8b, 1, 2]), MB),
    /not valid gzip/,
  );
  // Plain bodies pass through untouched.
  const plain = Buffer.from("<urlset/>");
  assert.equal(gunzipWithin(plain, MB), plain);
});

test("sitemap indexes with .gz children are followed through the fetch session", async () => {
  const index =
    "<sitemapindex><sitemap><loc>https://example.com/s1.xml.gz</loc></sitemap></sitemapindex>";
  const child = gzipSync(urlset("https://example.com/a"));
  const bomb = gzipSync(Buffer.alloc(11 * MB));
  const requested = [];
  // The stub stands in for the network; decompression is the real function.
  const fetchPage = async (url, { maxBytes }) => {
    requested.push(url);
    if (url.endsWith("/robots.txt"))
      return { url, body: "User-agent: *\nAllow: /" };
    const raw = url.endsWith("/sitemap.xml")
      ? Buffer.from(index)
      : url.endsWith("/s1.xml.gz")
        ? child
        : bomb;
    return {
      url,
      body: gunzipWithin(raw, maxBytes).toString(),
      bytes: raw.length,
    };
  };
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "leeds-gzip-"));
  const app = createApplication({
    dataDirectory,
    port: 0,
    fetchPage,
    timing: { politenessMs: 0, retryBaseMs: 1 },
  });
  const base = `http://127.0.0.1:${(await app.listen()).port}/api`;
  const call = async (route, body) => {
    const r = await fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:4180",
      },
      body: body && JSON.stringify(body),
    });
    return r.json();
  };
  const run = async (urls, maxPages) => {
    const { run } = await call("/runs", {
      actorId: "feed-reader",
      input: { urls, maxPages },
    });
    for (let i = 0; i < 100; i++) {
      const { run: r } = await call("/runs/" + run.id);
      if (!["QUEUED", "RUNNING"].includes(r.status)) return r;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("run deadline");
  };
  try {
    const deep = await run(["https://example.com/sitemap.xml"], 2);
    assert.deepEqual(
      deep.results.filter((r) => r.kind === "sitemap-url").map((r) => r.loc),
      ["https://example.com/a"],
    );
    // robots.txt was consulted, so the child went through the session.
    assert.ok(requested.includes("https://example.com/robots.txt"));
    const bombRun = await run(["https://example.com/bomb.xml.gz"]);
    assert.equal(bombRun.status, "FAILED");
    assert.ok(
      bombRun.logs.some((l) =>
        /Decompressed response exceeds 10 MB limit/.test(l),
      ),
    );
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
