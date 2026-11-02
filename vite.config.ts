/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { appHostnames, originsFor } from "./server/hosts.mjs";

const hostnames = appHostnames();

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4180,
    strictPort: true,
    // Same hostnames as the API server; anything else is refused.
    allowedHosts: hostnames,
    // Only the app's own pages may make cross-origin reads from the dev server.
    cors: { origin: originsFor(hostnames, [4180]) },
    proxy: { "/api": "http://127.0.0.1:4181" },
    fs: {
      // Vite's defaults plus the local workspace database and its backups.
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/data/**",
        "**/data-*/**",
        "**/*.sqlite*",
      ],
    },
  },
  // Component tests (npm run test:ui); the browser test uses Playwright.
  test: {
    environment: "jsdom",
    include: ["tests/ui/**/*.test.tsx"],
  },
  build: {
    outDir: "dist",
    // The production CSP (default-src 'self') blocks data: URIs, so small
    // assets such as font subsets must stay separate files.
    assetsInlineLimit: 0,
  },
});
