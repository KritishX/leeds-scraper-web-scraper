import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { originsFor, APP_PORTS } from "./hosts.mjs";
import { validateUrl } from "./crawler.mjs";
import { HttpError, reject, text } from "./errors.mjs";
import { cronPlan } from "./cron.mjs";
import { exportRecords } from "./export.mjs";

const now = () => new Date().toISOString();
// The HTTP layer: security headers, the Host allowlist and Origin check, JSON
// body limits, the API routes and static files from dist/.
export function createServer({
  port,
  hostnames,
  actors,
  version,
  store,
  engine,
}) {
  const {
    db,
    getWorkspace,
    list,
    runSummaries,
    countResources,
    find,
    save,
    remove,
    capacity,
  } = store;
  const { enqueue, abortRun, actorFor, validInput } = engine;
  async function body(req) {
    if (
      !(req.headers["content-type"] || "")
        .toLowerCase()
        .startsWith("application/json")
    )
      reject(415, "JSON content type required");
    // A declared oversize body is refused before reading, so the client gets
    // the 413 instead of a reset connection.
    if (Number(req.headers["content-length"]) > 32768)
      reject(413, "Request body exceeds 32 KB");
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 32768) reject(413, "Request body exceeds 32 KB");
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString());
      if (!value || typeof value !== "object" || Array.isArray(value))
        reject(400, "JSON object required");
      return value;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      reject(400, "Invalid JSON");
    }
  }
  const json = (res, value, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      const ports = [
        ...new Set([...APP_PORTS, server.address()?.port || port]),
      ];
      const allowedHosts = new Set(
        hostnames.flatMap((h) => [h, ...ports.map((p) => `${h}:${p}`)]),
      );
      const origins = new Set(originsFor(hostnames, ports));
      if (!allowedHosts.has(req.headers.host)) reject(403, "Unrecognized Host");
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) reject(403, "Origin is not allowed");
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }
      if (
        ["POST", "PATCH", "DELETE", "PUT"].includes(req.method) &&
        !origins.has(origin)
      )
        reject(403, "An allowlisted Origin is required");
      const url = new URL(req.url, "http://localhost");
      const p = url.pathname;
      const method = req.method;
      if (p === "/api/health" && method === "GET") {
        json(res, { ok: true, mode: "local", version });
        return;
      }
      if (p === "/api/catalog" && method === "GET") {
        json(res, { actors });
        return;
      }
      if (p === "/api/workspace" && method === "GET") {
        json(res, { workspace: getWorkspace() });
        return;
      }
      if (p === "/api/settings" && method === "PATCH") {
        const b = await body(req);
        db.prepare("UPDATE workspace SET name=? WHERE id=1").run(
          text(b.name, "Workspace name", 80),
        );
        json(res, { workspace: getWorkspace() });
        return;
      }
      if (p === "/api/dashboard" && method === "GET") {
        const stats = db
          .prepare(
            `SELECT COUNT(*) AS totalRuns,
          COALESCE(SUM(json_extract(data,'$.status')='SUCCEEDED'),0) AS succeededRuns,
          COALESCE(SUM(json_extract(data,'$.status')='FAILED'),0) AS failedRuns,
          COALESCE(SUM(json_extract(data,'$.status') IN ('RUNNING','QUEUED')),0) AS runningRuns,
          COALESCE(SUM(json_extract(data,'$.resultCount')),0) AS totalResults
          FROM resources WHERE kind='run'`,
          )
          .get();
        stats.tasks = countResources("task");
        json(res, { stats, recentRuns: runSummaries(5) });
        return;
      }
      if (p === "/api/runs" && method === "GET") {
        json(res, { runs: runSummaries() });
        return;
      }
      if (p === "/api/runs" && method === "POST") {
        const b = await body(req);
        json(res, { run: enqueue(b.actorId, b.input) }, 201);
        return;
      }
      const runMatch = p.match(/^\/api\/runs\/([^/]+)(?:\/(abort|export))?$/);
      if (runMatch) {
        const run = find(runMatch[1], "run");
        if (!runMatch[2] && method === "GET") {
          json(res, { run });
          return;
        }
        if (runMatch[2] === "abort" && method === "POST") {
          json(res, { run: abortRun(run.id) });
          return;
        }
        if (runMatch[2] === "export" && method === "GET") {
          const format = url.searchParams.get("format") || "json";
          const { contentType, body: output } = exportRecords(
            run.results,
            format,
          );
          res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${run.id}.${format}"`,
          });
          res.end(output);
          return;
        }
      }
      if (p === "/api/storage" && method === "GET") {
        json(res, {
          datasets: runSummaries().map((r) => ({
            id: r.id,
            runId: r.id,
            actorId: r.actorId,
            createdAt: r.createdAt,
            resultCount: r.resultCount,
            status: r.status,
          })),
        });
        return;
      }
      if (p === "/api/tasks" && method === "GET") {
        json(res, { tasks: list("task") });
        return;
      }
      if (p === "/api/tasks" && method === "POST") {
        const b = await body(req);
        capacity("task");
        const actor = actorFor(b.actorId);
        const task = {
          id: randomUUID(),
          name: text(b.name, "Task name"),
          actorId: b.actorId,
          input: validInput(actor, b.input),
          createdAt: now(),
        };
        save("task", task);
        json(res, { task }, 201);
        return;
      }
      const taskMatch = p.match(/^\/api\/tasks\/([^/]+)(?:\/(run))?$/);
      if (taskMatch) {
        const task = find(taskMatch[1], "task");
        if (taskMatch[2] && method === "POST") {
          json(res, { run: enqueue(task.actorId, task.input) }, 201);
          return;
        }
        if (!taskMatch[2] && method === "DELETE") {
          remove(task.id, "task");
          for (const schedule of list("schedule").filter(
            (s) => s.taskId === task.id,
          ))
            remove(schedule.id, "schedule");
          json(res, { ok: true });
          return;
        }
      }
      if (p === "/api/schedules" && method === "GET") {
        json(res, { schedules: list("schedule") });
        return;
      }
      if (p === "/api/schedules" && method === "POST") {
        const b = await body(req);
        capacity("schedule");
        find(b.taskId, "task");
        const plan = cronPlan(b.cron, b.intervalMinutes);
        const schedule = {
          id: randomUUID(),
          name: text(b.name, "Schedule name"),
          taskId: b.taskId,
          cron: plan.cron,
          intervalMinutes: plan.intervalMinutes,
          enabled: b.enabled === true,
          timezone: "UTC",
          nextRunAt: new Date(plan.nextAfter(Date.now())).toISOString(),
          createdAt: now(),
          lastRunId: null,
          lastError: null,
        };
        save("schedule", schedule);
        json(res, { schedule }, 201);
        return;
      }
      const scheduleMatch = p.match(/^\/api\/schedules\/([^/]+)$/);
      if (scheduleMatch && method === "DELETE") {
        remove(scheduleMatch[1], "schedule");
        json(res, { ok: true });
        return;
      }
      if (scheduleMatch && method === "PATCH") {
        const schedule = find(scheduleMatch[1], "schedule"),
          b = await body(req);
        if (b.name !== undefined) schedule.name = text(b.name, "Schedule name");
        if (b.enabled !== undefined) {
          if (typeof b.enabled !== "boolean")
            reject(400, "Enabled must be boolean");
          schedule.enabled = b.enabled;
        }
        // Timing is replanned only when it changes; renaming or toggling keeps
        // the pending occurrence. An interval alone replaces a stored cron.
        if (b.cron !== undefined || b.intervalMinutes !== undefined) {
          const plan =
            b.cron !== undefined
              ? cronPlan(b.cron)
              : cronPlan(undefined, b.intervalMinutes);
          schedule.cron = plan.cron;
          schedule.intervalMinutes = plan.intervalMinutes;
          schedule.nextRunAt = new Date(
            plan.nextAfter(Date.now()),
          ).toISOString();
        } else if (Date.parse(schedule.nextRunAt) <= Date.now())
          schedule.nextRunAt = new Date(
            cronPlan(
              schedule.cron ?? undefined,
              schedule.intervalMinutes,
            ).nextAfter(Date.now()),
          ).toISOString();
        save("schedule", schedule);
        json(res, { schedule });
        return;
      }
      if (p === "/api/integrations" && method === "GET") {
        json(res, { integrations: list("integration") });
        return;
      }
      if (p === "/api/integrations" && method === "POST") {
        const b = await body(req);
        capacity("integration");
        let endpoint = null;
        if (b.url) {
          try {
            endpoint = validateUrl(b.url).href;
          } catch (e) {
            reject(400, e.message);
          }
        }
        const integration = {
          id: randomUUID(),
          name: text(b.name, "Integration name"),
          type: text(b.type, "Type", 40),
          enabled: false,
          mode: "local-preference",
          url: endpoint,
          createdAt: now(),
          notice:
            "Saved preference only. External webhook delivery is not implemented.",
        };
        save("integration", integration);
        json(res, { integration }, 201);
        return;
      }
      const integrationMatch = p.match(/^\/api\/integrations\/([^/]+)$/);
      if (integrationMatch && method === "DELETE") {
        remove(integrationMatch[1], "integration");
        json(res, { ok: true });
        return;
      }
      if (p.startsWith("/api/")) reject(404, "API route not found");
      if (method !== "GET" && method !== "HEAD")
        reject(405, "Method not allowed");
      const root = path.resolve(
        fileURLToPath(new URL("../dist/", import.meta.url)),
      );
      let decoded;
      try {
        decoded = decodeURIComponent(p);
      } catch {
        reject(400, "Malformed path");
      }
      let target = path.resolve(root, "." + decoded);
      if (!target.startsWith(root + path.sep) && target !== root)
        reject(403, "Path not allowed");
      if (!existsSync(target) || !statSync(target).isFile())
        target = path.join(root, "index.html");
      if (!existsSync(target))
        reject(503, "Frontend build is unavailable; run npm run build");
      const ext = path.extname(target);
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".ico": "image/x-icon",
        }[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(method === "HEAD" ? undefined : readFileSync(target));
    } catch (e) {
      if (!res.headersSent)
        json(
          res,
          {
            error:
              e instanceof HttpError
                ? e.message
                : e.message && /URL|network|HTTP/.test(e.message)
                  ? e.message
                  : "An internal server error occurred",
          },
          e instanceof HttpError ? e.status : 500,
        );
      else res.end();
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 50;
  server.keepAliveTimeout = 5000;
  return server;
}
