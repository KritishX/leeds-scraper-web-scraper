import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./catalog.mjs";
import { appHostnames } from "./hosts.mjs";
import { fetchPublicResource, fetchPublicJson } from "./crawler.mjs";
import { readLlmConfig } from "./sources.mjs";
import { openStore } from "./store.mjs";
import { createRunEngine } from "./runs.mjs";
import { startScheduler } from "./scheduler.mjs";
import { createServer } from "./routes.mjs";
export { cronPlan } from "./cron.mjs";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
);
const MAX_RUNS = 200;
// One local workspace owns every resource: there are no accounts or sessions.
// The loopback bind, Host allowlist and Origin check are the access controls.
export function createApplication({
  dataDirectory = path.resolve("data"),
  port = 4181,
  fetchPage = fetchPublicResource,
  fetchJson = fetchPublicJson,
  llm = null,
  googleSources = {},
  timing = { politenessMs: 500, retryBaseMs: 1000 },
  maxRuns = MAX_RUNS,
  hostnames = appHostnames(),
} = {}) {
  const actors = buildCatalog({
    llmConfigured: Boolean(llm),
    googleMapsConfigured: Boolean(googleSources.googleMapsKey),
    googleSearchConfigured: Boolean(
      googleSources.googleSearchKey && googleSources.googleSearchEngineId,
    ),
  });
  const store = openStore(dataDirectory, maxRuns);
  const engine = createRunEngine({
    store,
    actors,
    fetchPage,
    fetchJson,
    llm,
    googleSources,
    timing,
    maxRuns,
  });
  const scheduler = startScheduler({ store, enqueue: engine.enqueue });
  const server = createServer({
    port,
    hostnames,
    actors,
    version,
    store,
    engine,
  });
  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve(server.address()));
      }),
    address: () => server.address(),
    async close() {
      scheduler.stop();
      engine.stop();
      await new Promise((resolve) => {
        if (!server.listening) return resolve();
        server.close(resolve);
        server.closeIdleConnections();
      });
      await engine.idle();
      store.db.close();
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApplication({
    dataDirectory: process.env.LEEDS_DATA_DIR || path.resolve("data"),
    port: Number(process.env.PORT || 4181),
    llm: readLlmConfig(process.env),
    googleSources: {
      googleMapsKey: process.env.LEEDS_GOOGLE_MAPS_API_KEY,
      googleSearchKey: process.env.LEEDS_GOOGLE_SEARCH_API_KEY,
      googleSearchEngineId: process.env.LEEDS_GOOGLE_SEARCH_ENGINE_ID,
      youtubeKey: process.env.LEEDS_YOUTUBE_API_KEY,
    },
  });
  const address = await app.listen();
  console.log(`Leeds Harvester server: http://127.0.0.1:${address.port}`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
