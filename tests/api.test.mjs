import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createApplication } from "../server/index.mjs";
import { cronPlan } from "../server/cron.mjs";
const origin = "http://127.0.0.1:4180";
const fixture =
  '<html><head><title>=FORMULA()</title></head><body><h1>Fixture business</h1><a href="/contact">Contact</a><a href="mailto:contact@example.com">Email</a></body></html>';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const fixturePage = async (url) => ({
  body: fixture,
  url,
  bytes: fixture.length,
});
// Tests skip politeness delays and use near-instant retry backoff.
const timing = { politenessMs: 0, retryBaseMs: 1 };
async function start(options) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "leeds-test-"));
  const app = createApplication({
    dataDirectory,
    port: 0,
    fetchPage: fixturePage,
    timing,
    ...options,
  });
  const { port } = await app.listen();
  return { app, dataDirectory, base: `http://127.0.0.1:${port}/api` };
}
function client(base) {
  return async (
    route,
    { method = "GET", body, requestOrigin = origin } = {},
  ) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    return { status: response.status, data };
  };
}
// fetch() cannot send a custom Host header, so the DNS-rebinding guard is probed directly.
const statusWithHost = (base, route, host) =>
  new Promise((resolve, reject) => {
    const target = new URL(base + route);
    http
      .get(
        {
          hostname: target.hostname,
          port: target.port,
          path: target.pathname,
          headers: { Host: host },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      )
      .on("error", reject);
  });
async function until(request, id, terminal = true) {
  for (let i = 0; i < 100; i++) {
    const { data } = await request("/runs/" + id);
    if (
      terminal
        ? !["QUEUED", "RUNNING"].includes(data.run.status)
        : data.run.status === "RUNNING"
    )
      return data.run;
    await delay(20);
  }
  assert.fail("Run status deadline");
}
// Waits until the worker has written its closing log line, not just the stored ABORTED status.
async function workerDone(request, id) {
  for (let i = 0; i < 100; i++) {
    const { run } = (await request("/runs/" + id)).data;
    if (run.logs.at(-1).endsWith("Run " + run.status.toLowerCase())) return run;
    await delay(20);
  }
  assert.fail("Worker deadline");
}
test("local workspace: no sign-in, real worker, cancellation, exports and durable workflows", async () => {
  let slow = false;
  const fetchPage = async (url, { signal }) => {
    if (slow)
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    return fixturePage(url);
  };
  let { app, dataDirectory, base } = await start({ fetchPage });
  let request = client(base);
  try {
    const health = await request("/health");
    assert.equal(health.status, 200);
    assert.equal(
      health.data.version,
      JSON.parse(readFileSync(new URL("../package.json", import.meta.url)))
        .version,
    );
    assert.equal(
      (await request("/workspace")).data.workspace.name,
      "Local workspace",
    );
    assert.equal((await request("/runs")).status, 200);
    // Browser-reachable mutations still require an allowlisted Origin; foreign Hosts are refused.
    assert.equal(
      (
        await request("/settings", {
          method: "PATCH",
          requestOrigin: "https://evil.example",
          body: { name: "Wrong" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/settings", {
          method: "PATCH",
          requestOrigin: null,
          body: { name: "Wrong" },
        })
      ).status,
      403,
    );
    assert.equal(await statusWithHost(base, "/runs", "attacker.example"), 403);
    assert.equal(
      (
        await request("/settings", {
          method: "PATCH",
          body: { name: "Research desk" },
        })
      ).data.workspace.name,
      "Research desk",
    );
    assert.equal(
      (await request("/auth/login", { method: "POST", body: {} })).status,
      404,
    );
    const input = { urls: ["https://example.com"], maxPages: 2 };
    assert.equal(
      (
        await request("/runs", {
          method: "POST",
          body: {
            actorId: "website-content",
            input: { urls: ["http://127.0.0.1"], maxPages: 1 },
          },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/runs", {
          method: "POST",
          body: { actorId: "ai-extract", input: { ...input, prompt: "x" } },
        })
      ).status,
      409,
    );
    const tooFewPages = await request("/runs", {
      method: "POST",
      body: {
        actorId: "website-content",
        input: {
          urls: ["https://example.com", "https://example.org"],
          maxPages: 1,
        },
      },
    });
    assert.equal(tooFewPages.status, 400);
    assert.match(tooFewPages.data.error, /start URLs/);
    const created = await request("/runs", {
      method: "POST",
      body: { actorId: "website-content", input },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const id = created.data.run.id;
    const run = await until(request, id);
    assert.equal(run.status, "SUCCEEDED");
    assert.equal(run.resultCount, 2);
    assert.equal(run.results[0].title, "=FORMULA()");
    assert.match(run.results[0].sourceUrl, /example.com/);
    const csv = await request("/runs/" + id + "/export?format=csv");
    assert.equal(csv.status, 200);
    assert.match(csv.data, /'=FORMULA/);
    assert.equal((await request("/runs/missing")).status, 404);
    const task = (
      await request("/tasks", {
        method: "POST",
        body: { name: "Research", actorId: "contact-extractor", input },
      })
    ).data.task;
    const schedule = (
      await request("/schedules", {
        method: "POST",
        body: {
          name: "Daily",
          taskId: task.id,
          cron: "0 9 * * *",
          enabled: true,
        },
      })
    ).data.schedule;
    assert.equal(schedule.timezone, "UTC");
    assert.ok(Date.parse(schedule.nextRunAt) > Date.now());
    assert.equal(
      (
        await request("/schedules/" + schedule.id, {
          method: "PATCH",
          body: { enabled: false },
        })
      ).data.schedule.enabled,
      false,
    );
    const integration = (
      await request("/integrations", {
        method: "POST",
        body: {
          name: "Preference",
          type: "webhook",
          url: "https://example.com/hook",
        },
      })
    ).data.integration;
    assert.equal(integration.enabled, false);
    assert.equal(integration.mode, "local-preference");
    slow = true;
    const pending = (
      await request("/runs", {
        method: "POST",
        body: { actorId: "website-content", input },
      })
    ).data.run;
    await until(request, pending.id, false);
    assert.equal(
      (
        await request("/runs/" + pending.id + "/abort", {
          method: "POST",
          body: {},
        })
      ).data.run.status,
      "ABORTED",
    );
    const aborted = await workerDone(request, pending.id);
    assert.equal(aborted.status, "ABORTED");
    assert.ok(
      aborted.logs.some((l) => l.endsWith("Abort requested")),
      aborted.logs.join("\n"),
    );
    // A run stopped by shutdown keeps that reason too.
    const stopped = (
      await request("/runs", {
        method: "POST",
        body: { actorId: "website-content", input },
      })
    ).data.run;
    await until(request, stopped.id, false);
    await app.close();
    app = createApplication({ dataDirectory, port: 0, fetchPage, timing });
    base = `http://127.0.0.1:${(await app.listen()).port}/api`;
    request = client(base);
    assert.equal(
      (await request("/workspace")).data.workspace.name,
      "Research desk",
    );
    const afterShutdown = (await request("/runs/" + stopped.id)).data.run;
    assert.equal(afterShutdown.status, "ABORTED");
    assert.equal(afterShutdown.logs.at(-1).endsWith("Run aborted"), true);
    assert.ok(
      afterShutdown.logs.some((l) =>
        l.endsWith("Server shutdown stopped this run"),
      ),
      afterShutdown.logs.join("\n"),
    );
    assert.equal((await request("/tasks")).data.tasks[0].id, task.id);
    assert.equal((await request("/runs/" + id)).data.run.resultCount, 2);
    await request("/tasks/" + task.id, { method: "DELETE" });
    assert.equal((await request("/schedules")).data.schedules.length, 0);
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("scheduler computes explicit UTC and rejects malformed or impossible input", () => {
  const start = Date.parse("2026-10-22T08:30:00Z");
  assert.equal(
    new Date(cronPlan("0 9 * * *").nextAfter(start)).toISOString(),
    "2026-10-22T09:00:00.000Z",
  );
  assert.equal(cronPlan(undefined, 5).nextAfter(start), start + 300000);
  for (const cron of ["* * *", "100 * * * *", "* * * * * *", "0 0 31 2 *"])
    assert.throws(() => cronPlan(cron).nextAfter(start));
});
test("retention never deletes an aborted run while its worker still holds it", async () => {
  let release;
  const held = new Promise((r) => {
    release = r;
  });
  // The collector ignores the abort signal so the worker outlives the persisted ABORTED status.
  const { app, dataDirectory, base } = await start({
    fetchPage: async (url) => {
      await held;
      return fixturePage(url);
    },
    maxRuns: 1,
  });
  const request = client(base);
  try {
    const input = { urls: ["https://example.com"], maxPages: 1 };
    const first = (
      await request("/runs", {
        method: "POST",
        body: { actorId: "website-content", input },
      })
    ).data.run;
    await until(request, first.id, false);
    assert.equal(
      (
        await request("/runs/" + first.id + "/abort", {
          method: "POST",
          body: {},
        })
      ).data.run.status,
      "ABORTED",
    );
    assert.equal(
      (
        await request("/runs", {
          method: "POST",
          body: { actorId: "website-content", input },
        })
      ).status,
      429,
    );
    release();
    let finished;
    for (let i = 0; i < 100; i++) {
      finished = (await request("/runs/" + first.id)).data.run;
      if (finished.logs.at(-1).endsWith("Run aborted")) break;
      await delay(10);
    }
    assert.equal(finished.status, "ABORTED");
    assert.ok(finished.finishedAt);
    assert.equal(
      (
        await request("/runs", {
          method: "POST",
          body: { actorId: "website-content", input },
        })
      ).status,
      201,
    );
    assert.equal((await request("/runs/" + first.id)).status, 404);
  } finally {
    release();
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("cron matches either restricted day field, as standard cron does", () => {
  // 2026-10-22 is a Thursday: the next Monday (26th) precedes the 1st of November.
  assert.equal(
    new Date(
      cronPlan("0 9 1 * 1").nextAfter(Date.parse("2026-10-22T10:00:00Z")),
    ).toISOString(),
    "2026-10-26T09:00:00.000Z",
  );
  assert.equal(
    new Date(
      cronPlan("0 9 1 * *").nextAfter(Date.parse("2026-10-22T10:00:00Z")),
    ).toISOString(),
    "2026-11-01T09:00:00.000Z",
  );
});
test("schedule edits replan only timing changes and can switch cron to interval", async () => {
  const { app, dataDirectory, base } = await start();
  const request = client(base);
  try {
    const task = (
      await request("/tasks", {
        method: "POST",
        body: {
          name: "T",
          actorId: "website-content",
          input: { urls: ["https://example.com"] },
        },
      })
    ).data.task;
    const created = (
      await request("/schedules", {
        method: "POST",
        body: {
          name: "S",
          taskId: task.id,
          intervalMinutes: 60,
          enabled: true,
        },
      })
    ).data.schedule;
    await delay(5);
    const renamed = (
      await request("/schedules/" + created.id, {
        method: "PATCH",
        body: { name: "Renamed", enabled: false },
      })
    ).data.schedule;
    assert.equal(renamed.nextRunAt, created.nextRunAt);
    assert.equal(renamed.name, "Renamed");
    const cron = (
      await request("/schedules/" + created.id, {
        method: "PATCH",
        body: { cron: "0 9 * * *" },
      })
    ).data.schedule;
    assert.equal(cron.cron, "0 9 * * *");
    assert.equal(cron.intervalMinutes, null);
    const interval = (
      await request("/schedules/" + created.id, {
        method: "PATCH",
        body: { intervalMinutes: 5 },
      })
    ).data.schedule;
    assert.equal(interval.cron, null);
    assert.equal(interval.intervalMinutes, 5);
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
async function finished(request, actorId, input) {
  const created = await request("/runs", {
    method: "POST",
    body: { actorId, input },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  return until(request, created.data.run.id);
}
test("transient failures are retried; robots.txt disallow is honoured and explained", async () => {
  const calls = [];
  let flaky = 1;
  const { FetchError } = await import("../server/crawler.mjs");
  const fetchPage = async (url) => {
    calls.push(url);
    if (url.endsWith("/robots.txt"))
      return { body: "User-agent: *\nDisallow: /private", url, bytes: 30 };
    if (url.endsWith("/flaky") && flaky-- > 0)
      throw new FetchError("HTTP 503", { status: 503, retryable: true });
    if (url.endsWith("/gone"))
      throw new FetchError("HTTP 404", { status: 404 });
    return fixturePage(url);
  };
  const { app, dataDirectory, base } = await start({ fetchPage });
  const request = client(base);
  try {
    const flakyRun = await finished(request, "website-content", {
      urls: ["https://example.com/flaky"],
    });
    assert.equal(flakyRun.status, "SUCCEEDED");
    assert.ok(flakyRun.logs.some((l) => /Retrying .*HTTP 503/.test(l)));
    const gone = await finished(request, "website-content", {
      urls: ["https://example.com/gone"],
    });
    assert.equal(gone.status, "FAILED");
    assert.equal(calls.filter((u) => u.endsWith("/gone")).length, 1);
    const blocked = await finished(request, "website-content", {
      urls: ["https://example.com/private/page"],
    });
    assert.equal(blocked.status, "FAILED");
    assert.match(blocked.error, /robots\.txt/);
    assert.equal(calls.filter((u) => u.includes("/private/")).length, 0);
    const overridden = await finished(request, "website-content", {
      urls: ["https://example.com/private/page"],
      respectRobots: false,
    });
    assert.equal(overridden.status, "SUCCEEDED");
    // One robots.txt request per origin per run.
    assert.equal(calls.filter((u) => u.endsWith("/robots.txt")).length, 3);
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("feeds, JSONL export and source actors run end to end", async () => {
  const feed =
    "<rss><channel><title>N</title><item><title>A</title><link>https://example.com/a</link></item><item><title>B</title><link>https://example.com/b</link></item></channel></rss>";
  const fetchPage = async (url) =>
    url.endsWith("/feed.xml")
      ? { body: feed, url, bytes: feed.length }
      : fixturePage(url);
  const jsonCalls = [];
  const fetchJson = async (url, options) => {
    jsonCalls.push({
      url,
      method: options.method ?? "GET",
      body: options.body,
    });
    if (url.startsWith("https://nominatim.openstreetmap.org/"))
      return [
        {
          boundingbox: ["53.7", "53.9", "-1.7", "-1.4"],
          display_name: "Leeds, United Kingdom",
        },
      ];
    if (url === "https://overpass-api.de/api/interpreter")
      return {
        elements: [
          {
            type: "node",
            id: 1,
            lat: 53.8,
            lon: -1.55,
            tags: {
              name: "Fixture Dental",
              "addr:housenumber": "1",
              "addr:street": "Park Row",
              "addr:city": "Leeds",
              phone: "+44 113 1",
              website: "example.com/dental",
            },
          },
          {
            type: "way",
            id: 2,
            center: { lat: 53.81, lon: -1.56 },
            tags: { name: "Second Smile" },
          },
        ],
      };
    if (url.startsWith("https://www.youtube.com/oembed"))
      return {
        type: "video",
        title: "Fixture video",
        author_name: "Leeds",
        thumbnail_url: "https://i.example/t.jpg",
        thumbnail_width: 480,
        html: "<iframe></iframe>",
      };
    throw new Error("unexpected " + url);
  };
  const { app, dataDirectory, base } = await start({ fetchPage, fetchJson });
  const request = client(base);
  try {
    const feedRun = await finished(request, "feed-reader", {
      urls: ["https://example.com/feed.xml"],
    });
    assert.equal(feedRun.status, "SUCCEEDED");
    assert.deepEqual(
      feedRun.results.map((r) => r.title),
      ["A", "B"],
    );
    const jsonl = await request("/runs/" + feedRun.id + "/export?format=jsonl");
    assert.equal(jsonl.status, 200);
    assert.deepEqual(
      jsonl.data.split("\n").map((l) => JSON.parse(l).title),
      ["A", "B"],
    );
    const leads = await finished(request, "local-business-leads", {
      category: "dentist",
      place: "Leeds",
      limit: 10,
      findEmails: true,
    });
    assert.equal(leads.status, "SUCCEEDED", leads.error);
    assert.deepEqual(
      leads.results.map((r) => r.name),
      ["Fixture Dental", "Second Smile"],
    );
    const [dental, second] = leads.results;
    assert.equal(dental.address, "1 Park Row, Leeds");
    assert.equal(dental.website, "https://example.com/dental");
    assert.deepEqual(dental.emails, ["contact@example.com"]);
    assert.equal(dental.sourceUrl, "https://www.openstreetmap.org/node/1");
    assert.match(dental.attribution, /OpenStreetMap/);
    assert.equal(second.latitude, 53.81);
    assert.equal(second.emails, undefined);
    // Negative coordinates are numbers, not formulas.
    const leadsCsv = (await request("/runs/" + leads.id + "/export?format=csv"))
      .data;
    assert.match(leadsCsv, /"-1\.55"/);
    assert.doesNotMatch(leadsCsv, /'-1\.55/);
    const overpass = jsonCalls.find((c) => c.method === "POST");
    assert.match(
      decodeURIComponent(overpass.body),
      /nwr\["amenity"="dentist"\]\["name"\];out center tags 10;/,
    );
    const tooBig = await request("/runs", {
      method: "POST",
      body: {
        actorId: "local-business-leads",
        input: { category: "custom", customTag: 'shop=a"];(', place: "x" },
      },
    });
    assert.equal(tooBig.status, 400);
    const social = await finished(request, "social-embeds", {
      urls: [
        "https://www.youtube.com/watch?v=abc",
        "https://example.com/not-supported",
      ],
    });
    assert.equal(social.status, "SUCCEEDED");
    assert.equal(social.results.length, 1);
    assert.equal(social.results[0].provider, "YouTube");
    assert.equal(social.results[0].title, "Fixture video");
    assert.ok(social.logs.some((l) => /unsupported provider/.test(l)));
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("AI extraction sends page Markdown to the configured model and stores its JSON", async () => {
  const received = [];
  const model = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({
        auth: req.headers.authorization,
        path: req.url,
        body: JSON.parse(raw),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '<think>reasoning</think>```json\n{"business":"Fixture business","email":"contact@example.com"}\n```',
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise((r) => model.listen(0, "127.0.0.1", r));
  const llm = {
    baseUrl: `http://127.0.0.1:${model.address().port}/v1`,
    model: "fixture-model",
    apiKey: "test-key",
  };
  const { app, dataDirectory, base } = await start({ llm });
  const request = client(base);
  try {
    assert.equal(
      (await request("/catalog")).data.actors.find((a) => a.id === "ai-extract")
        .status,
      "ready",
    );
    const run = await finished(request, "ai-extract", {
      urls: ["https://example.com/"],
      prompt: "Business name and email",
    });
    assert.equal(run.status, "SUCCEEDED", run.error);
    assert.deepEqual(run.results[0].data, {
      business: "Fixture business",
      email: "contact@example.com",
    });
    assert.equal(run.results[0].model, "fixture-model");
    const [call] = received;
    assert.equal(call.path, "/v1/chat/completions");
    assert.equal(call.auth, "Bearer test-key");
    assert.equal(call.body.model, "fixture-model");
    assert.match(call.body.messages[0].content, /untrusted data/);
    assert.match(call.body.messages[1].content, /Business name and email/);
    assert.match(call.body.messages[1].content, /# Fixture business/);
    // The key is configuration, never stored with the run.
    assert.doesNotMatch(JSON.stringify(run), /test-key/);
  } finally {
    await app.close();
    model.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("robots.txt server errors and redirects to disallowed pages are skipped", async () => {
  const { FetchError } = await import("../server/crawler.mjs");
  const fetchPage = async (url) => {
    if (url === "https://down.example/robots.txt")
      throw new FetchError("HTTP 503", { status: 503, retryable: true });
    if (url.endsWith("/robots.txt"))
      return { body: "User-agent: *\nDisallow: /private", url, bytes: 30 };
    // An allowed URL that redirects into a disallowed path.
    if (url === "https://example.com/go")
      return {
        body: fixture,
        url: "https://example.com/private/landing",
        bytes: fixture.length,
      };
    return fixturePage(url);
  };
  const { app, dataDirectory, base } = await start({ fetchPage });
  const request = client(base);
  try {
    const down = await finished(request, "website-content", {
      urls: ["https://down.example/page"],
    });
    assert.equal(down.status, "FAILED");
    assert.ok(down.logs.some((l) => /could not be read/.test(l)));
    const redirected = await finished(request, "website-content", {
      urls: ["https://example.com/go"],
    });
    assert.equal(redirected.status, "FAILED");
    assert.equal(redirected.resultCount, 0);
    assert.ok(
      redirected.logs.some((l) =>
        /Skipped https:\/\/example.com\/go: disallowed by robots.txt/.test(l),
      ),
    );
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("sitemap indexes are followed within the file limit", async () => {
  const index =
    "<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap><sitemap><loc>https://other.example/s2.xml</loc></sitemap></sitemapindex>";
  const child =
    "<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>";
  const fetchPage = async (url) =>
    url.endsWith("/sitemap.xml")
      ? { body: index, url, bytes: index.length }
      : url.endsWith("/s1.xml")
        ? { body: child, url, bytes: child.length }
        : fixturePage(url);
  const { app, dataDirectory, base } = await start({ fetchPage });
  const request = client(base);
  try {
    const shallow = await finished(request, "feed-reader", {
      urls: ["https://example.com/sitemap.xml"],
    });
    assert.deepEqual(
      shallow.results.map((r) => r.kind),
      ["sitemap", "sitemap"],
    );
    const deep = await finished(request, "feed-reader", {
      urls: ["https://example.com/sitemap.xml"],
      maxPages: 3,
    });
    // The same-site child sitemap is read; the other site's is not.
    assert.deepEqual(
      deep.results.filter((r) => r.kind === "sitemap-url").map((r) => r.loc),
      ["https://example.com/a", "https://example.com/b"],
    );
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("the page that crosses the download budget keeps its records", async () => {
  const big =
    "<html><head><title>Big</title></head><body>" +
    Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">p</a>`).join("") +
    "x".repeat(1900000) +
    "</body></html>";
  const fetchPage = async (url) => ({ body: big, url, bytes: big.length });
  const { app, dataDirectory, base } = await start({ fetchPage });
  const request = client(base);
  try {
    const run = await finished(request, "website-content", {
      urls: ["https://example.com/"],
      maxPages: 20,
    });
    // 12 pages of ~1.9 MB cross the 20 MiB budget; the 12th page's record is kept (it was dropped before).
    assert.equal(run.status, "SUCCEEDED");
    assert.equal(run.resultCount, 12);
    assert.ok(run.logs.some((l) => /20 MB download limit/.test(l)));
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("local leads are kept when a run is cancelled during website lookups", async () => {
  const fetchJson = async (url) =>
    url.includes("nominatim")
      ? [
          {
            boundingbox: ["53.7", "53.9", "-1.7", "-1.4"],
            display_name: "Leeds",
          },
        ]
      : {
          elements: [
            {
              type: "node",
              id: 1,
              lat: 1,
              lon: 2,
              tags: { name: "A", website: "https://a.example/" },
            },
            { type: "node", id: 2, lat: 1, lon: 2, tags: { name: "B" } },
          ],
        };
  // Website lookups hang until the run is aborted.
  const fetchPage = (url, { signal }) =>
    new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
  const { app, dataDirectory, base } = await start({ fetchPage, fetchJson });
  const request = client(base);
  try {
    const created = (
      await request("/runs", {
        method: "POST",
        body: {
          actorId: "local-business-leads",
          input: { category: "cafe", place: "Leeds", findEmails: true },
        },
      })
    ).data.run;
    for (
      let i = 0;
      i < 100 &&
      (await request("/runs/" + created.id)).data.run.resultCount < 2;
      i++
    )
      await delay(10);
    await request("/runs/" + created.id + "/abort", {
      method: "POST",
      body: {},
    });
    const run = await until(request, created.id);
    assert.equal(run.status, "ABORTED");
    assert.deepEqual(
      run.results.map((r) => r.name),
      ["A", "B"],
    );
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("a busy Overpass instance falls back to the mirror, then fails with a clear message", async () => {
  const { FetchError } = await import("../server/crawler.mjs");
  let mirrorDown = false;
  const asked = [];
  const fetchJson = async (url) => {
    asked.push(new URL(url).host);
    if (url.includes("nominatim"))
      return [
        {
          boundingbox: ["53.7", "53.9", "-1.7", "-1.4"],
          display_name: "Leeds",
        },
      ];
    if (url.startsWith("https://overpass-api.de/"))
      throw new FetchError("HTTP 502", { status: 502, retryable: true });
    if (mirrorDown)
      throw new FetchError("Request timed out", { retryable: true });
    return {
      elements: [
        { type: "node", id: 7, lat: 1, lon: 2, tags: { name: "Mirror Cafe" } },
      ],
    };
  };
  const { app, dataDirectory, base } = await start({ fetchJson });
  const request = client(base);
  try {
    const ok = await finished(request, "local-business-leads", {
      category: "cafe",
      place: "Leeds",
    });
    assert.equal(ok.status, "SUCCEEDED");
    assert.deepEqual(
      ok.results.map((r) => r.name),
      ["Mirror Cafe"],
    );
    assert.ok(
      ok.logs.some((l) =>
        /overpass-api\.de failed \(HTTP 502\); trying a mirror/.test(l),
      ),
    );
    mirrorDown = true;
    const down = await finished(request, "local-business-leads", {
      category: "cafe",
      place: "Leeds",
    });
    assert.equal(down.status, "FAILED");
    assert.match(down.error, /Overpass service is busy or unavailable/);
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("sitemaps may be up to 10 MB while pages stay limited to 2 MB", async () => {
  const entries = Array.from(
    { length: 12000 },
    (_, i) =>
      `<url><loc>https://example.com/page/${i}/${"x".repeat(200)}</loc></url>`,
  ).join("");
  const sitemap = `<urlset>${entries}</urlset>`;
  const page = "<html><body>" + "y".repeat(3 * 1024 * 1024) + "</body></html>";
  const fetchPage = async (url) =>
    url.endsWith(".xml")
      ? { body: sitemap, url, bytes: sitemap.length }
      : { body: page, url, bytes: page.length };
  const { app, dataDirectory, base } = await start({ fetchPage });
  const request = client(base);
  try {
    assert.ok(sitemap.length > 2 * 1024 * 1024);
    const read = await finished(request, "feed-reader", {
      urls: ["https://example.com/sitemap.xml"],
    });
    assert.equal(read.status, "SUCCEEDED");
    assert.equal(read.resultCount, 10000);
    const tooBig = await finished(request, "website-content", {
      urls: ["https://example.com/"],
    });
    assert.equal(tooBig.status, "FAILED");
    assert.ok(tooBig.logs.some((l) => /exceeds 2 MB limit/.test(l)));
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("the app answers on leedsharvester.localhost and configured names only", async () => {
  const { appHostnames } = await import("../server/hosts.mjs");
  assert.deepEqual(appHostnames({ LEEDS_HOSTS: "LeedsHarvester.com, " }), [
    "localhost",
    "127.0.0.1",
    "leedsharvester.localhost",
    "leedsharvester.com",
  ]);
  assert.throws(
    () => appHostnames({ LEEDS_HOSTS: "bad_host!" }),
    /invalid hostname/,
  );
  const { app, dataDirectory, base } = await start({
    hostnames: appHostnames({ LEEDS_HOSTS: "leedsharvester.com" }),
  });
  const port = new URL(base).port;
  const call = (host, origin) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/settings",
          method: "PATCH",
          headers: {
            Host: host,
            Origin: origin,
            "Content-Type": "application/json",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end('{"name":"Desk"}');
    });
  try {
    assert.equal(
      await call(
        "leedsharvester.localhost:4180",
        "http://leedsharvester.localhost:4180",
      ),
      200,
    );
    assert.equal(
      await call("leedsharvester.com:4181", "http://leedsharvester.com:4181"),
      200,
    );
    assert.equal(
      await call("evil.example:4180", "http://evil.example:4180"),
      403,
    );
    assert.equal(
      await call("leedsharvester.localhost:4180", "http://evil.localhost:4180"),
      403,
    );
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("cron accepts day-of-week 7, leap days and treats */N day fields as unrestricted", () => {
  const from = Date.parse("2026-10-22T10:00:00Z"); // a Thursday
  const next = (cron) => new Date(cronPlan(cron).nextAfter(from)).toISOString();
  assert.equal(next("0 0 * * 7"), "2026-10-25T00:00:00.000Z");
  assert.equal(next("0 0 * * 7"), next("0 0 * * 0"));
  assert.equal(next("0 0 29 2 *"), "2028-02-29T00:00:00.000Z");
  // Both fields must match: Mondays on odd days of the month (26 Oct and 2 Nov are even).
  assert.equal(next("0 0 */2 * 1"), "2026-11-09T00:00:00.000Z");
  for (const cron of ["61 * * * *", "* * * * 8"])
    assert.throws(() => cronPlan(cron), /out of range/);
  const started = performance.now();
  next("0 0 29 2 *");
  assert.throws(
    () => cronPlan("0 0 31 2 *").nextAfter(from),
    /no matching time/,
  );
  assert.ok(performance.now() - started < 50);
});
test("an empty optional URL list from the UI is accepted; a required one is not", async () => {
  const { app, dataDirectory, base } = await start();
  const request = client(base);
  try {
    // The same payload toInput() sends when the URL box is empty.
    assert.equal(
      (
        await request("/runs", {
          method: "POST",
          body: {
            actorId: "youtube-scraper",
            input: { urls: [], query: "lofi", limit: 20 },
          },
        })
      ).status,
      201,
    );
    const required = await request("/runs", {
      method: "POST",
      body: { actorId: "website-content", input: { urls: [] } },
    });
    assert.equal(required.status, 400);
    assert.match(required.data.error, /Provide 1/);
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("finished runs can be deleted; active ones cannot; tasks can be edited in place", async () => {
  let release;
  const held = new Promise((r) => (release = r));
  let slow = false;
  const { app, dataDirectory, base } = await start({
    fetchPage: async (url) => {
      if (slow) await held;
      return fixturePage(url);
    },
  });
  const request = client(base);
  try {
    const input = { urls: ["https://example.com"], maxPages: 1 };
    const done = await finished(request, "website-content", input);
    // Mutations need an allowlisted Origin, like every other mutation.
    assert.equal(
      (
        await request("/runs/" + done.id, {
          method: "DELETE",
          requestOrigin: null,
        })
      ).status,
      403,
    );
    assert.equal(
      (await request("/runs/" + done.id, { method: "DELETE" })).status,
      204,
    );
    assert.equal((await request("/runs/" + done.id)).status, 404);
    assert.equal(
      (await request("/runs/" + done.id, { method: "DELETE" })).status,
      404,
    );

    slow = true;
    const active = (
      await request("/runs", {
        method: "POST",
        body: { actorId: "website-content", input },
      })
    ).data.run;
    await until(request, active.id, false);
    assert.equal(
      (await request("/runs/" + active.id, { method: "DELETE" })).status,
      409,
    );
    // Aborted but its worker has not stopped yet: still refused.
    await request("/runs/" + active.id + "/abort", {
      method: "POST",
      body: {},
    });
    assert.equal(
      (await request("/runs/" + active.id, { method: "DELETE" })).status,
      409,
    );
    release();
    await workerDone(request, active.id);
    assert.equal(
      (await request("/runs/" + active.id, { method: "DELETE" })).status,
      204,
    );

    const task = (
      await request("/tasks", {
        method: "POST",
        body: { name: "T", actorId: "website-content", input },
      })
    ).data.task;
    const schedule = (
      await request("/schedules", {
        method: "POST",
        body: { name: "S", taskId: task.id, intervalMinutes: 60 },
      })
    ).data.schedule;
    assert.equal(
      (
        await request("/tasks/" + task.id, {
          method: "PATCH",
          requestOrigin: null,
          body: { name: "X" },
        })
      ).status,
      403,
    );
    const bad = await request("/tasks/" + task.id, {
      method: "PATCH",
      body: { input: { urls: ["http://127.0.0.1"] } },
    });
    assert.equal(bad.status, 400);
    const edited = await request("/tasks/" + task.id, {
      method: "PATCH",
      body: {
        name: "Renamed",
        input: { urls: ["https://example.org"], maxPages: 2 },
      },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.task.name, "Renamed");
    assert.deepEqual(edited.data.task.input.urls, ["https://example.org/"]);
    assert.equal(edited.data.task.input.maxPages, 2);
    const stored = (await request("/tasks")).data.tasks.find(
      (t) => t.id === task.id,
    );
    assert.equal(stored.name, "Renamed");
    assert.deepEqual(
      (await request("/schedules")).data.schedules.map((s) => [s.id, s.taskId]),
      [[schedule.id, task.id]],
    );
  } finally {
    release();
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("Feed Reader given a home page reads the same-site sitemaps declared in robots.txt", async () => {
  const sitemap =
    "<urlset><url><loc>https://example.test/a</loc></url></urlset>";
  const requested = [];
  const fetchPage = async (url) => {
    requested.push(url);
    const body = url.endsWith("/robots.txt")
      ? "User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml\nSitemap: https://other.example/sitemap.xml"
      : url.endsWith("/sitemap.xml")
        ? sitemap
        : fixture;
    return { body, url, bytes: body.length };
  };
  const { app, dataDirectory, base } = await start({ fetchPage });
  const request = client(base);
  try {
    // Default maxPages (1): the home page's slot goes to the sitemap found.
    const run = await finished(request, "feed-reader", {
      urls: ["https://example.test/"],
    });
    assert.equal(run.status, "SUCCEEDED", run.logs.join("\n"));
    assert.deepEqual(
      run.results.map((r) => r.loc),
      ["https://example.test/a"],
    );
    assert.ok(
      run.logs.some((l) =>
        l.includes(
          "Ignored cross-site sitemap https://other.example/sitemap.xml",
        ),
      ),
    );
    assert.ok(!requested.includes("https://other.example/sitemap.xml"));
    // Discovered sitemaps go through the session: robots.txt was read first.
    assert.ok(
      requested.indexOf("https://example.test/robots.txt") <
        requested.indexOf("https://example.test/sitemap.xml"),
    );
    // Without a Sitemap line the page is still a plain failure.
    const none = await finished(request, "feed-reader", {
      urls: ["https://example.org/"],
    });
    assert.equal(none.status, "FAILED");
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
test("cron schedules run in their time zone, including across daylight saving", () => {
  const next = (cron, zone, from) =>
    new Date(
      cronPlan(cron, undefined, zone).nextAfter(Date.parse(from)),
    ).toISOString();
  // 09:00 in London is 08:00 UTC in summer (BST) and 09:00 UTC in winter.
  assert.equal(
    next("0 9 * * *", "Europe/London", "2026-07-01T00:00:00Z"),
    "2026-07-01T08:00:00.000Z",
  );
  assert.equal(
    next("0 9 * * *", "Europe/London", "2026-12-01T00:00:00Z"),
    "2026-12-01T09:00:00.000Z",
  );
  // Spring forward (28 Mar 2027, 01:00 -> 02:00): 01:30 does not exist that day.
  assert.equal(
    next("30 1 * * *", "Europe/London", "2027-03-27T12:00:00Z"),
    "2027-03-29T00:30:00.000Z",
  );
  // Fall back (25 Oct 2026, 02:00 -> 01:00): 01:30 happens twice and fires once.
  const fallBack = cronPlan("30 1 * * *", undefined, "Europe/London");
  const first = fallBack.nextAfter(Date.parse("2026-10-24T12:00:00Z"));
  assert.equal(new Date(first).toISOString(), "2026-10-25T00:30:00.000Z");
  assert.equal(
    new Date(fallBack.nextAfter(first)).toISOString(),
    "2026-10-26T01:30:00.000Z",
  );
  // A +05:45 zone and the leap-day search stay correct and fast.
  assert.equal(
    next("15 6 * * 1", "Asia/Kathmandu", "2026-10-22T00:00:00Z"),
    "2026-10-26T00:30:00.000Z",
  );
  const started = performance.now();
  assert.equal(
    next("0 0 29 2 *", "Europe/London", "2026-10-22T00:00:00Z"),
    "2028-02-29T00:00:00.000Z",
  );
  assert.ok(performance.now() - started < 50);
  assert.throws(() => cronPlan("0 9 * * *", undefined, "Mars/Olympus"), {
    status: 400,
  });
});
test("schedules accept, validate and change a time zone", async () => {
  const { app, dataDirectory, base } = await start();
  const request = client(base);
  try {
    const task = (
      await request("/tasks", {
        method: "POST",
        body: {
          name: "T",
          actorId: "website-content",
          input: { urls: ["https://example.com"] },
        },
      })
    ).data.task;
    const bad = await request("/schedules", {
      method: "POST",
      body: {
        name: "S",
        taskId: task.id,
        cron: "0 9 * * *",
        timezone: "Nowhere/Land",
      },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.data.error, /time zone/);
    const utc = (
      await request("/schedules", {
        method: "POST",
        body: { name: "U", taskId: task.id, cron: "0 9 * * *" },
      })
    ).data.schedule;
    assert.equal(utc.timezone, "UTC");
    const local = (
      await request("/schedules", {
        method: "POST",
        body: {
          name: "L",
          taskId: task.id,
          cron: "0 9 * * *",
          timezone: "Asia/Kathmandu",
        },
      })
    ).data.schedule;
    assert.equal(local.timezone, "Asia/Kathmandu");
    assert.equal(new Date(local.nextRunAt).getUTCMinutes(), 15); // 09:00 at +05:45
    const moved = (
      await request("/schedules/" + local.id, {
        method: "PATCH",
        body: { timezone: "UTC" },
      })
    ).data.schedule;
    assert.equal(moved.timezone, "UTC");
    assert.equal(new Date(moved.nextRunAt).getUTCHours(), 9);
    assert.equal(moved.cron, "0 9 * * *");
  } finally {
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

// Writes finished runs straight into a workspace file, as older runs would be.
function seedRuns(dataDirectory, runs) {
  const db = new DatabaseSync(path.join(dataDirectory, "leeds.sqlite"));
  const insert = db.prepare(
    "INSERT INTO resources(id,kind,data) VALUES(?,'run',?)",
  );
  for (const run of runs)
    insert.run(
      run.id,
      JSON.stringify({
        actorId: "website-content",
        actorName: "Seed",
        status: "SUCCEEDED",
        resultCount: 1,
        logs: [],
        input: {},
        ...run,
      }),
    );
  db.close();
}
test("retention prunes finished runs by age and by database size, never active ones", async () => {
  let { app, dataDirectory, base } = await start();
  let request = client(base);
  let release;
  const held = new Promise((r) => (release = r));
  try {
    const settings = (body) => request("/settings", { method: "PATCH", body });
    assert.equal((await settings({ retainDays: 0 })).status, 400);
    assert.equal((await settings({ maxStorageMB: "big" })).status, 400);
    assert.equal((await settings({})).status, 400);
    const workspace = (await request("/workspace")).data.workspace;
    assert.deepEqual(workspace, {
      name: "Local workspace",
      retainDays: null,
      maxStorageMB: 1024,
    });
    await app.close();

    const day = 86400000;
    seedRuns(dataDirectory, [
      { id: "old-1", createdAt: new Date(Date.now() - 40 * day).toISOString() },
      { id: "old-2", createdAt: new Date(Date.now() - 31 * day).toISOString() },
      { id: "recent", createdAt: new Date(Date.now() - 2 * day).toISOString() },
    ]);
    app = createApplication({
      dataDirectory,
      port: 0,
      fetchPage: fixturePage,
      timing,
    });
    request = client(`http://127.0.0.1:${(await app.listen()).port}/api`);
    assert.equal(
      (
        await request("/settings", {
          method: "PATCH",
          body: { retainDays: 30 },
        })
      ).data.workspace.retainDays,
      30,
    );
    const input = { urls: ["https://example.com"], maxPages: 1 };
    const fresh = await finished(request, "website-content", input);
    await workerDone(request, fresh.id);
    const ids = (await request("/runs")).data.runs.map((r) => r.id).sort();
    assert.deepEqual(ids, [fresh.id, "recent"].sort());
    await app.close();

    // Three ~600 KB runs against a 1 MB limit: the two oldest go.
    const big = (id, ageDays) => ({
      id,
      createdAt: new Date(Date.now() - ageDays * day).toISOString(),
      results: [{ pad: "x".repeat(600 * 1024) }],
    });
    seedRuns(dataDirectory, [
      big("big-1", 5),
      big("big-2", 4),
      big("big-3", 3),
    ]);
    let slow = false;
    app = createApplication({
      dataDirectory,
      port: 0,
      timing,
      fetchPage: async (url) => {
        if (slow) await held;
        return fixturePage(url);
      },
    });
    request = client(`http://127.0.0.1:${(await app.listen()).port}/api`);
    await request("/settings", {
      method: "PATCH",
      body: { retainDays: null, maxStorageMB: 1 },
    });
    slow = true;
    const running = (
      await request("/runs", {
        method: "POST",
        body: { actorId: "website-content", input },
      })
    ).data.run;
    await until(request, running.id, false);
    slow = false;
    const quick = await finished(request, "website-content", input);
    await workerDone(request, quick.id);
    const left = (await request("/runs")).data.runs.map((r) => r.id);
    assert.ok(!left.includes("big-1") && !left.includes("big-2"), left.join());
    assert.ok(left.includes(running.id), "a running run is never pruned");
    const { database } = (await request("/storage")).data;
    assert.ok(
      database.usedBytes > 0 && database.usedBytes <= 1024 * 1024,
      String(database.usedBytes),
    );
    assert.ok(database.fileBytes > 0);
    assert.equal(database.maxStorageMB, 1);
  } finally {
    release();
    await app.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
