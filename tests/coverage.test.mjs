// Documented behaviours without tests elsewhere: scheduler firing, robots.txt
// edge cases, Retry-After, the address guard and the HTTP layer's limits.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../server/index.mjs";
import { startScheduler } from "../server/scheduler.mjs";
import { createFetchSession } from "../server/session.mjs";
import { parseRobots } from "../server/robots.mjs";
import { isPublicIPv4, retryAfter } from "../server/crawler.mjs";

const page = (url, body = "<html></html>") => ({
  url,
  body,
  bytes: body.length,
});

test("scheduler: a due schedule starts its task, records errors and disables unplannable timing", () => {
  const now = Date.now();
  const schedules = [
    {
      id: "due",
      taskId: "t",
      enabled: true,
      cron: null,
      intervalMinutes: 5,
      nextRunAt: new Date(now - 1000).toISOString(),
    },
    {
      id: "later",
      taskId: "t",
      enabled: true,
      cron: null,
      intervalMinutes: 5,
      nextRunAt: new Date(now + 60000).toISOString(),
    },
    {
      id: "paused",
      taskId: "t",
      enabled: false,
      cron: null,
      intervalMinutes: 5,
      nextRunAt: new Date(now - 1000).toISOString(),
    },
    // Stored before validation existed: it can never fire again.
    {
      id: "broken",
      taskId: "t",
      enabled: true,
      cron: "0 0 31 2 *",
      intervalMinutes: null,
      nextRunAt: new Date(now - 1000).toISOString(),
    },
  ];
  const saved = [];
  const started = [];
  let queueFull = false;
  const scheduler = startScheduler({
    store: {
      list: () => schedules,
      find: () => ({
        actorId: "website-content",
        input: { urls: ["https://example.com/"] },
      }),
      save: (_kind, s) => saved.push(s.id),
    },
    enqueue: (actorId) => {
      if (queueFull)
        throw Object.assign(
          new Error("Run queue is full (20 pending runs maximum)"),
          { status: 429 },
        );
      started.push(actorId);
      return { id: "run-" + started.length };
    },
  });
  try {
    scheduler.tick();
    assert.deepEqual(saved, ["due", "broken"]);
    assert.equal(started.length, 2);
    const [due, , , broken] = schedules;
    assert.equal(due.lastRunId, "run-1");
    assert.equal(due.lastError, null);
    assert.ok(Date.parse(due.nextRunAt) > now + 4 * 60000);
    assert.equal(broken.enabled, false);
    assert.match(broken.lastError, /no matching time/);
    // A full queue is recorded on the schedule, which still moves on.
    queueFull = true;
    due.nextRunAt = new Date(now - 1000).toISOString();
    scheduler.tick();
    assert.match(due.lastError, /queue is full/);
    assert.ok(Date.parse(due.nextRunAt) > now);
    // After stop() nothing fires.
    scheduler.stop();
    due.nextRunAt = new Date(now - 1000).toISOString();
    saved.length = 0;
    scheduler.tick();
    assert.deepEqual(saved, []);
  } finally {
    scheduler.stop();
  }
});

test("robots.txt: a 4xx file allows crawling and over-long rules are dropped", async () => {
  const requested = [];
  const get = createFetchSession({
    signal: new AbortController().signal,
    politenessMs: 0,
    fetchPage: async (url) => {
      requested.push(url);
      if (url.endsWith("/robots.txt"))
        throw Object.assign(new Error("HTTP 404"), { status: 404 });
      return page(url);
    },
  });
  assert.equal(
    (await get("https://example.com/a")).url,
    "https://example.com/a",
  );
  assert.deepEqual(requested, [
    "https://example.com/robots.txt",
    "https://example.com/a",
  ]);
  const long = "/" + "a".repeat(600);
  const rules = parseRobots(
    `User-agent: *\nDisallow: ${long}\nDisallow: /short`,
  );
  assert.equal(rules.allows(long), true);
  assert.equal(rules.allows("/short"), false);
});

test("robots.txt: Crawl-delay paces requests to a host and is capped at 10 s", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const times = [];
  const get = createFetchSession({
    signal: new AbortController().signal,
    politenessMs: 500,
    fetchPage: async (url) => {
      if (url.endsWith("/robots.txt"))
        return page(url, "User-agent: *\nCrawl-delay: 3600");
      times.push(Date.now());
      return page(url);
    },
  });
  // Let the session reach its next wait, then move the clock.
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  // robots.txt is the first request to the host, so even the first page
  // waits out the delay, capped at 10 s rather than the hour asked for.
  const first = get("https://example.com/1");
  await settle();
  t.mock.timers.tick(10_000);
  await first;
  const second = get("https://example.com/2");
  await settle();
  t.mock.timers.tick(9_999);
  await settle();
  assert.equal(times.length, 1, "still waiting before 10 s");
  t.mock.timers.tick(1);
  await second;
  assert.equal(times[1] - times[0], 10_000);
});

test("Retry-After accepts delta-seconds and HTTP dates", () => {
  assert.equal(retryAfter("3"), 3000);
  assert.equal(retryAfter("0"), 0);
  assert.equal(retryAfter("-5"), 0);
  assert.equal(retryAfter(""), null);
  assert.equal(retryAfter("soon"), null);
  const later = new Date(Date.now() + 120_000).toUTCString();
  assert.ok(Math.abs(retryAfter(later) - 120_000) < 2000);
  assert.equal(retryAfter(new Date(Date.now() - 60_000).toUTCString()), 0);
});

test("address guard: boundaries of the reserved IPv4 ranges", () => {
  for (const [address, expected] of [
    ["100.63.255.255", true],
    ["100.64.0.0", false],
    ["100.127.255.255", false],
    ["100.128.0.0", true],
    ["198.17.255.255", true],
    ["198.18.0.0", false],
    ["198.19.255.255", false],
    ["198.20.0.0", true],
    ["169.253.255.255", true],
    ["169.254.0.1", false],
    ["169.254.169.254", false],
    ["169.255.0.0", true],
    ["0.0.0.0", false],
    ["0.255.255.255", false],
    ["1.0.0.0", true],
    ["223.255.255.255", true],
    ["224.0.0.0", false],
    ["255.255.255.255", false],
    ["10.0.0.1", false],
    ["172.15.255.255", true],
    ["172.16.0.0", false],
    ["172.31.255.255", false],
    ["172.32.0.0", true],
  ])
    assert.equal(isPublicIPv4(address), expected, address);
});

test("HTTP layer: body limits, JSON content type, path traversal and the queue limit", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "leeds-coverage-"));
  let release;
  const held = new Promise((r) => (release = r));
  const app = createApplication({
    dataDirectory,
    port: 0,
    timing: { politenessMs: 0, retryBaseMs: 1 },
    fetchPage: async (url) => {
      if (!url.endsWith("/robots.txt")) await held;
      return page(url);
    },
  });
  const { port } = await app.listen();
  const raw = (rawPath, { method = "GET", headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: rawPath,
          method,
          headers: { Host: `127.0.0.1:${port}`, ...headers },
        },
        (res) => {
          let text = "";
          res.on("data", (c) => (text += c));
          res.on("end", () => resolve({ status: res.statusCode, text }));
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  const origin = { Origin: "http://127.0.0.1:4180" };
  const post = (
    route,
    value,
    headers = { "Content-Type": "application/json" },
  ) =>
    raw("/api" + route, {
      method: "POST",
      headers: { ...origin, ...headers },
      body: value,
    });
  try {
    assert.equal((await post("/runs", "x".repeat(40000))).status, 413);
    assert.equal(
      (await post("/runs", "{}", { "Content-Type": "text/plain" })).status,
      415,
    );
    assert.equal((await post("/runs", "{not json")).status, 400);
    assert.equal((await post("/runs", "[]")).status, 400);
    for (const attempt of [
      "/%2e%2e%2fpackage.json",
      "/..%2fpackage.json",
      "/%2e%2e/package.json",
      "/../package.json",
      "/..%5cpackage.json",
    ]) {
      const res = await raw(attempt);
      assert.ok(!res.text.includes('"name": "leeds-harvester"'), attempt);
      assert.ok(
        [400, 403, 200, 503].includes(res.status),
        attempt + " " + res.status,
      );
    }
    assert.equal((await raw("/%2e%2e%2fpackage.json")).status, 403);
    assert.equal((await raw("/%E0%A4%A")).status, 400);
    // Two runs execute, twenty wait; the next is refused.
    const input = JSON.stringify({
      actorId: "website-content",
      input: { urls: ["https://example.com"] },
    });
    for (let i = 0; i < 22; i++)
      assert.equal((await post("/runs", input)).status, 201, "run " + i);
    const full = await post("/runs", input);
    assert.equal(full.status, 429);
    assert.match(full.text, /queue is full/);
  } finally {
    release();
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
