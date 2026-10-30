import { randomUUID } from "node:crypto";
import { ACCEPT, validateUrl } from "./crawler.mjs";
import { extractHtml, extractFeed, pageMarkdown } from "./extractors.mjs";
import { normalizeInput, InputError } from "./input.mjs";
import { createFetchSession, RobotsBlocked } from "./session.mjs";
import { runPublicPlatform } from "./platforms.mjs";
import { createGoogleSourceRunners } from "./google-sources.mjs";
import {
  runLocalBusinessLeads,
  runSocialEmbeds,
  askModel,
  parseModelJson,
} from "./sources.mjs";
import { reject } from "./errors.mjs";

const now = () => new Date().toISOString();
const MAX_QUEUE = 20,
  PAGE_BYTES = 2 * 1024 * 1024,
  RUN_BYTES = 20 * 1024 * 1024,
  MAX_RECORDS = 10000,
  AI_PAGE_CHARS = 30000;
// The run queue and its workers: validation, budgets, deadlines, retention
// and cancellation. At most two runs execute at once.
export function createRunEngine({
  store,
  actors,
  fetchPage,
  fetchJson,
  llm,
  googleSources,
  timing,
  maxRuns,
}) {
  const { db, find, save, runSummaries, getWorkspace, usedBytes } = store;
  for (const row of db
    .prepare(
      "SELECT data FROM resources WHERE kind='run' AND json_extract(data,'$.status') IN ('QUEUED','RUNNING')",
    )
    .all()) {
    const run = JSON.parse(row.data);
    run.status = "FAILED";
    run.finishedAt = now();
    run.error = "Server stopped before this run completed";
    run.logs.push(`${now()} Server restart interrupted execution`);
    save("run", run);
  }
  const queue = [],
    active = new Map();
  let closing = false;
  const log = (run, message) => {
    if (run.logs.length < 100) run.logs.push(`${now()} ${message}`);
  };
  const actorFor = (id) => {
    const actor = actors.find((a) => a.id === id);
    if (!actor) reject(400, "Unknown Actor");
    if (!["ready", "access-limited"].includes(actor.status))
      reject(
        409,
        actor.notice || "This Actor requires a provider and cannot run",
      );
    return actor;
  };
  const validInput = (actor, input) => {
    try {
      return normalizeInput(actor, input);
    } catch (e) {
      if (e instanceof InputError) reject(400, e.message);
      throw e;
    }
  };
  function prune() {
    const runs = runSummaries();
    const excess = Math.max(0, runs.length - maxRuns + 1);
    // An aborted run is persisted as ABORTED before its worker finishes, so
    // retention follows worker ownership rather than the stored status alone.
    const held = new Set([...active.keys(), ...queue]);
    const removable = runs
      .toReversed()
      .filter(
        (r) => !held.has(r.id) && !["RUNNING", "QUEUED"].includes(r.status),
      );
    if (removable.length < excess)
      reject(429, "Run retention capacity reached");
    for (const r of removable.slice(0, excess))
      db.prepare("DELETE FROM resources WHERE id=? AND kind='run'").run(r.id);
  }
  let deletedSinceVacuum = 0;
  // Age and size retention, applied after each run finishes: the oldest
  // finished runs that no worker or queue holds are deleted until both limits
  // hold. VACUUM returns the space to disk now and then, not after every run.
  function pruneStorage() {
    const { retainDays, maxStorageMB } = getWorkspace();
    const cutoff = retainDays ? Date.now() - retainDays * 86400000 : -Infinity;
    const held = new Set([...active.keys(), ...queue]);
    const remove = db.prepare(
      "DELETE FROM resources WHERE id=? AND kind='run'",
    );
    for (const r of runSummaries(-1).toReversed()) {
      if (held.has(r.id) || ["RUNNING", "QUEUED"].includes(r.status)) continue;
      if (
        Date.parse(r.createdAt) >= cutoff &&
        usedBytes() <= maxStorageMB * 1024 * 1024
      )
        break;
      remove.run(r.id);
      deletedSinceVacuum++;
    }
    if (deletedSinceVacuum >= 20) {
      db.exec("VACUUM");
      deletedSinceVacuum = 0;
    }
  }
  function enqueue(actorId, input) {
    const actor = actorFor(actorId);
    const normalized = validInput(actor, input);
    if (closing) reject(503, "Server is shutting down");
    if (queue.length >= MAX_QUEUE)
      reject(429, `Run queue is full (${MAX_QUEUE} pending runs maximum)`);
    prune();
    const run = {
      id: randomUUID(),
      actorId,
      actorName: actor.name,
      status: "QUEUED",
      input: normalized,
      createdAt: now(),
      startedAt: null,
      finishedAt: null,
      resultCount: 0,
      error: null,
      logs: [],
      results: [],
    };
    log(run, "Run queued");
    save("run", run);
    queue.push(run.id);
    setImmediate(pump);
    return run;
  }
  function pump() {
    if (closing) return;
    while (active.size < 2 && queue.length) {
      const id = queue.shift();
      const controller = new AbortController();
      active.set(id, controller);
      execute(id, controller)
        .catch((e) => console.error(`Run ${id} worker failed:`, e))
        .finally(() => {
          active.delete(id);
          pump();
        });
    }
  }
  // Collects a crawl run: pages from the start URLs and, when the actor follows
  // links and the page limit allows, same-site links found on those pages.
  async function crawl(run, actor, ctx) {
    const { signal, get, push, log, budget } = ctx;
    const pending = [...run.input.urls],
      seen = new Set();
    let failures = 0,
      skipped = 0;
    const limit = run.input.maxPages ?? run.input.urls.length;
    const pageLimit = actor.maxBytes ?? PAGE_BYTES;
    // A start URL that is a web page rather than a feed: queue the same-site
    // sitemaps its robots.txt declares. Returns how many were queued.
    async function discoverSitemaps(url) {
      const origin = new URL(url).origin;
      let queued = 0;
      for (const sitemap of await get.sitemaps(url)) {
        let target;
        try {
          target = validateUrl(sitemap);
        } catch {
          continue;
        }
        if (target.origin !== origin)
          log(
            `Ignored cross-site sitemap ${target.href} from ${origin}/robots.txt`,
          );
        else if (!seen.has(target.href) && !pending.includes(target.href)) {
          pending.push(target.href);
          queued++;
        }
      }
      if (queued)
        log(
          `${url} is not a feed; reading ${queued} sitemap(s) from robots.txt`,
        );
      return queued;
    }
    // The download budget is checked before each page, so the page that crosses
    // it is still extracted and kept.
    while (
      !budget.stop &&
      budget.bytes < RUN_BYTES &&
      pending.length &&
      seen.size < limit
    ) {
      if (signal.aborted) throw signal.reason;
      const url = pending.shift();
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const page = await get(url, {
          accept: ACCEPT[actor.accept ?? "html"],
          maxBytes: pageLimit,
        });
        if (signal.aborted) throw signal.reason;
        if (
          !page ||
          typeof page.body !== "string" ||
          typeof page.url !== "string"
        )
          throw new Error("Collector returned an invalid page");
        const pageBytes = page.bytes ?? Buffer.byteLength(page.body);
        if (pageBytes > pageLimit)
          throw new Error(`Page exceeds ${pageLimit / 1024 / 1024} MB limit`);
        budget.bytes += pageBytes;
        let result;
        if (actor.accept === "feed") result = extractFeed(page.body, page.url);
        else if (actor.id === "ai-extract") {
          const { title, markdown, links } = pageMarkdown(
            page.body,
            page.url,
            AI_PAGE_CHARS,
          );
          const reply = await askModel(llm, {
            instruction: run.input.prompt,
            url: page.url,
            title,
            markdown,
            signal,
          });
          let data = null,
            parseError = null;
          try {
            data = parseModelJson(reply);
          } catch (e) {
            parseError = e.message;
          }
          result = {
            records: [
              {
                sourceUrl: page.url,
                title,
                collectedAt: now(),
                model: llm.model,
                contentTruncated: markdown.length >= AI_PAGE_CHARS,
                data,
                ...(parseError
                  ? { parseError, rawReply: reply.slice(0, 4000) }
                  : {}),
              },
            ],
            links,
          };
        } else result = extractHtml(actor.id, page.body, page.url, run.input);
        let added = 0;
        for (const record of result.records) {
          if (!push(record)) break;
          added++;
        }
        log(`Collected ${page.url} (${added} record${added === 1 ? "" : "s"})`);
        if (limit > run.input.urls.length) {
          const origin = new URL(page.url).origin;
          for (const link of result.links) {
            if (pending.length >= 100) break;
            try {
              const target = validateUrl(link);
              if (
                target.origin === origin &&
                !seen.has(target.href) &&
                !pending.includes(target.href)
              )
                pending.push(target.href);
            } catch {
              /* Unsafe links are never scheduled. */
            }
          }
        }
      } catch (e) {
        if (signal.aborted) throw signal.reason;
        if (e instanceof RobotsBlocked) {
          skipped++;
          log(`Skipped ${url}: ${e.reason}`);
        } else if (
          actor.accept === "feed" &&
          e.wrongType &&
          run.input.urls.includes(url) &&
          (await discoverSitemaps(url))
        ) {
          // The page was not a feed; its slot goes to the sitemaps found.
          seen.delete(url);
        } else {
          failures++;
          log(`Failed ${url}: ${String(e.message).slice(0, 200)}`);
        }
      }
      save("run", run);
    }
    if (budget.bytes >= RUN_BYTES)
      log("Stopped at the 20 MB download limit; results kept");
    if (skipped && !run.results.length && !failures)
      throw new Error(
        "Every requested page was skipped because of the site's robots.txt. Turn off “Respect robots.txt” only if you have permission.",
      );
    return { failures };
  }
  const sourceRunners = {
    "local-business-leads": runLocalBusinessLeads,
    "social-embeds": runSocialEmbeds,
    ...createGoogleSourceRunners(googleSources),
    ...Object.fromEntries(
      [
        "tiktok-scraper",
        "instagram-scraper",
        "instagram-profile",
        "instagram-reel",
        "facebook-search-posts",
        "tiktok-search",
      ].map((id) => [id, runPublicPlatform]),
    ),
  };
  async function execute(id, controller) {
    const run = find(id, "run");
    const actor = actors.find((a) => a.id === run.actorId);
    run.status = "RUNNING";
    run.startedAt = now();
    log(run, "Collection started");
    save("run", run);
    const deadlineMs = actor?.deadlineMs ?? 60000;
    const started = Date.now();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(
            `Run exceeded ${Math.round(deadlineMs / 1000)}-second deadline`,
          ),
        ),
      deadlineMs,
    );
    timeout.unref();
    // Downloaded HTML and stored (serialized) results have separate budgets;
    // reaching either one ends the run with the results collected so far.
    // `stop` records which result limit ended collection; downloads are bounded
    // separately in the crawl loop.
    const budget = { bytes: 0, stored: 0, stop: null };
    const push = (record) => {
      if (budget.stop) return false;
      const size = Buffer.byteLength(JSON.stringify(record));
      if (budget.stored + size > RUN_BYTES) budget.stop = "stored result";
      else if (run.results.length >= MAX_RECORDS) budget.stop = "record";
      if (budget.stop) return false;
      budget.stored += size;
      run.results.push(record);
      run.resultCount = run.results.length;
      return true;
    };
    try {
      if (!actor) throw new Error("This Actor is no longer available");
      const signal = controller.signal;
      // A fetch session for the run's signal, or for a shorter-lived signal
      // when a source bounds part of its work (e.g. website lookups).
      const session = (sessionSignal) => {
        const get = createFetchSession({
          fetchPage,
          signal: sessionSignal,
          respectRobots: run.input.respectRobots !== false,
          politenessMs: timing.politenessMs,
          retryBaseMs: timing.retryBaseMs,
          log: (message) => log(run, message),
        });
        const wrapped = (url, options = {}) =>
          get(url, { maxBytes: PAGE_BYTES, ...options });
        wrapped.sitemaps = get.sitemaps;
        return wrapped;
      };
      const get = session(signal);
      const remainingBytes = () => {
        if (budget.bytes >= RUN_BYTES) {
          budget.stop = "download";
          throw Object.assign(
            new Error("Run download budget reached; partial results retained"),
            { code: "LEEDS_RUN_DOWNLOAD_LIMIT" },
          );
        }
        return RUN_BYTES - budget.bytes;
      };
      const chargeBytes = (bytes) => {
        budget.bytes += bytes;
      };
      const ctx = {
        actorId: actor.id,
        input: run.input,
        signal,
        budget,
        push,
        session,
        get,
        getPage: async (url, options = {}) => {
          const page = await get(url, {
            ...options,
            maxBytes: Math.min(
              options.maxBytes ?? PAGE_BYTES,
              remainingBytes(),
            ),
          });
          chargeBytes(page.bytes ?? Buffer.byteLength(page.body));
          return page;
        },
        // Persists progress so collected records are visible while a source
        // is still working.
        checkpoint: () => save("run", run),
        log: (message) => log(run, message),
        timeLeft: () => deadlineMs - (Date.now() - started),
        fetchJson: async (url, options = {}) => {
          let measured = false;
          const data = await fetchJson(url, {
            ...options,
            signal,
            maxBytes: Math.min(
              options.maxBytes ?? 5 * 1024 * 1024,
              remainingBytes(),
            ),
            onBytes: (bytes) => {
              measured = true;
              chargeBytes(bytes);
            },
          });
          if (!measured) chargeBytes(Buffer.byteLength(JSON.stringify(data)));
          return data;
        },
      };
      const { failures = 0 } =
        actor.mode === "source"
          ? await sourceRunners[actor.id](ctx)
          : await crawl(run, actor, ctx);
      if (budget.bytes >= RUN_BYTES) budget.stop ??= "download";
      if (budget.stop)
        log(run, `Stopped at the ${budget.stop} limit; results kept`);
      run.status = failures ? "FAILED" : "SUCCEEDED";
      if (failures)
        run.error = `${failures} request(s) failed; partial results retained`;
    } catch (e) {
      const persisted = find(run.id, "run");
      run.status = persisted.status === "ABORTED" ? "ABORTED" : "FAILED";
      run.error =
        run.status === "ABORTED"
          ? "Run aborted"
          : String(e?.message || "Collection failed").slice(0, 300);
    } finally {
      clearTimeout(timeout);
      const persisted = find(run.id, "run");
      if (persisted.status === "ABORTED") {
        run.status = "ABORTED";
        run.error = "Run aborted";
        // abortRun logged its reason on the stored copy; keep it.
        run.logs.push(...persisted.logs.filter((l) => !run.logs.includes(l)));
      }
      run.finishedAt = now();
      log(run, `Run ${run.status.toLowerCase()}`);
      save("run", run);
      try {
        pruneStorage();
      } catch (e) {
        console.error("Storage retention failed:", e);
      }
    }
  }
  function abortRun(id, reason = "Abort requested") {
    const run = find(id, "run");
    if (["QUEUED", "RUNNING"].includes(run.status)) {
      run.status = "ABORTED";
      run.finishedAt = now();
      run.error = "Run aborted";
      log(run, reason);
      save("run", run);
      const i = queue.indexOf(id);
      if (i >= 0) queue.splice(i, 1);
      active.get(id)?.abort(new Error("Run aborted"));
    }
    return run;
  }
  return {
    enqueue,
    abortRun,
    actorFor,
    validInput,
    // True while a worker or the queue owns the run, even after an abort was
    // stored: the worker still saves it once more when it stops.
    held: (id) => active.has(id) || queue.includes(id),
    // Refuses new runs and aborts every queued and running one.
    stop() {
      closing = true;
      for (const id of [...queue, ...active.keys()])
        abortRun(id, "Server shutdown stopped this run");
    },
    async idle() {
      while (active.size)
        await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
