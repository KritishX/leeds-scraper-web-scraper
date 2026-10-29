import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fetchPublicJson } from "../server/crawler.mjs";

test("credential headers never follow a cross-origin redirect; ordinary public redirects still work", async (t) => {
  t.mock.method(dns, "lookup", async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  syncBuiltinESMExports();
  let calls = 0;
  t.mock.method(https, "request", (_url, _options, callback) => {
    calls++;
    const request = new EventEmitter();
    request.end = () =>
      queueMicrotask(() => {
        const response = new PassThrough();
        response.complete = true;
        response.statusCode = calls % 2 === 1 ? 302 : 200;
        response.headers =
          response.statusCode === 302
            ? { location: "https://other.example/data" }
            : { "content-type": "application/json" };
        callback(response);
        if (response.statusCode === 200) response.end('{"ok":true}');
      });
    return request;
  });
  try {
    for (const header of [
      "X-Goog-Api-Key",
      "authorization",
      "Cookie",
      "Proxy-Authorization",
    ]) {
      calls = 0;
      await assert.rejects(
        fetchPublicJson("https://service.example/data", {
          headers: { [header]: "test-credential" },
        }),
        /cannot redirect to another origin/,
      );
      assert.equal(calls, 1);
    }
    calls = 0;
    assert.deepEqual(await fetchPublicJson("https://service.example/data"), {
      ok: true,
    });
    assert.equal(calls, 2);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
