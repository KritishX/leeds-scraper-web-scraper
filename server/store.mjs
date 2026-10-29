import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { reject } from "./errors.mjs";

const MAX_RESOURCES = 100;
// Every resource is one JSON document in SQLite, keyed by id and kind.
export function openStore(dataDirectory, maxRuns) {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDirectory, "leeds.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;",
  );
  db.exec(`CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1),name TEXT NOT NULL);
 INSERT OR IGNORE INTO workspace VALUES(1,'Local workspace');
 CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS resources_kind ON resources(kind);`);
  const getWorkspace = () =>
    db.prepare("SELECT name FROM workspace WHERE id=1").get();
  const list = (kind) =>
    db
      .prepare("SELECT data FROM resources WHERE kind=? ORDER BY rowid DESC")
      .all(kind)
      .map((v) => JSON.parse(v.data));
  // List views select only metadata inside SQLite; complete datasets stay on detail/export.
  const runSummaries = (limit = maxRuns) =>
    db
      .prepare(
        `
    SELECT id,
      json_extract(data,'$.actorId') AS actorId,
      json_extract(data,'$.actorName') AS actorName,
      json_extract(data,'$.status') AS status,
      json_extract(data,'$.createdAt') AS createdAt,
      json_extract(data,'$.startedAt') AS startedAt,
      json_extract(data,'$.finishedAt') AS finishedAt,
      json_extract(data,'$.resultCount') AS resultCount,
      json_extract(data,'$.error') AS error
    FROM resources WHERE kind='run' ORDER BY rowid DESC LIMIT ?
  `,
      )
      .all(limit);
  const countResources = (kind) =>
    db.prepare("SELECT COUNT(*) AS n FROM resources WHERE kind=?").get(kind).n;
  const find = (id, kind) => {
    const row = db
      .prepare("SELECT data FROM resources WHERE id=? AND kind=?")
      .get(id, kind);
    if (!row) reject(404, "Resource not found");
    return JSON.parse(row.data);
  };
  const save = (kind, data) =>
    db
      .prepare(
        "INSERT INTO resources(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(data.id, kind, JSON.stringify(data));
  const remove = (id, kind) => {
    find(id, kind);
    db.prepare("DELETE FROM resources WHERE id=? AND kind=?").run(id, kind);
  };
  const capacity = (kind) => {
    if (countResources(kind) >= MAX_RESOURCES)
      reject(409, `Limit of ${MAX_RESOURCES} ${kind} resources reached`);
  };
  return {
    db,
    getWorkspace,
    list,
    runSummaries,
    countResources,
    find,
    save,
    remove,
    capacity,
  };
}
