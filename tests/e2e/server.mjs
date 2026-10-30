// Browser-test server: the real app, routes, security checks and built UI,
// with page fetches answered by a fixture instead of the network. It uses the
// same fetchPage option as the API tests; no production check is changed.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../../server/index.mjs";

const page =
  '<html><head><title>Fixture Shop</title><meta name="description" content="A page served by the browser-test fixture"></head><body><h1>Fixture Shop</h1></body></html>';
const app = createApplication({
  dataDirectory: mkdtempSync(path.join(tmpdir(), "leeds-e2e-")),
  port: Number(process.env.E2E_PORT || 4189),
  timing: { politenessMs: 0, retryBaseMs: 1 },
  fetchPage: async (url) =>
    url.endsWith("/robots.txt")
      ? { url, body: "User-agent: *\nAllow: /" }
      : { url, body: page, bytes: page.length },
});
const { port } = await app.listen();
console.log(`E2E server on http://127.0.0.1:${port}`);
const stop = () => app.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
