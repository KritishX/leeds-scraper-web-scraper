# Local security model

Leeds Harvester is a single-workspace web data collector for one machine. It has no accounts or sign-in: everything stored belongs to the one local workspace. It does not execute uploaded code, install remote scrapers, reuse browser cookies, or bypass target access controls.

## Who can reach the workspace

- The server listens only on `127.0.0.1`.
- Requests must carry an allowed Host header on the app ports: `localhost`, `127.0.0.1`, `leedsharvester.localhost`, or a name listed in `LEEDS_HOSTS`. This blocks DNS-rebinding pages that resolve their own hostname to loopback. The server and the Vite dev server share this list (`server/hosts.mjs`).
- Every request that changes data (`POST`, `PATCH`, `DELETE`) needs an Origin of an allowed hostname on port 4180 or 4181. Requests also need a JSON content type, and there are no state-changing `GET` routes. Together these stop other websites from acting through the browser.
- In development, Vite refuses the `data/` directories and SQLite files, and allows cross-origin reads only from the app's own origins.

**Known limitation:** without sign-in, any process or OS user on the same machine can use the API, because a non-browser client can send any Origin header. The data directory is created with mode `0700`, but the API does not repeat that restriction. Run Leeds Harvester only on a machine you control. Before sharing it or exposing it on a network, add authentication and HTTPS.

## Outgoing requests

- Page fetches, feeds, `robots.txt`, OpenStreetMap, Google APIs and oEmbed requests all go through one guard, `fetchPublicResource`. The only exception is the AI endpoint, which the operator configures through environment variables.
- URL parsing rejects embedded credentials, unsupported schemes and nonstandard ports.
- Only public IPv4 addresses are accepted. Every DNS answer is checked, and the connection uses the address that was checked. Every redirect is parsed and validated again.
- Each request has its own socket. Unused error and redirect bodies are discarded by closing that socket rather than being downloaded. IPv6-only sites are unsupported.
- POST requests (Overpass and Google Places queries) never follow redirects. Credential-bearing GET requests (Authorization, Cookie, Proxy-Authorization or X-Goog-Api-Key headers) refuse cross-origin redirects.
- HTML and XML are parsed as data and scripts are never run. Email matching uses bounded patterns, and `robots.txt` wildcards are matched without regular expressions, so hostile input can't cause runaway matching time.

## Politeness

- Each run fetches `robots.txt` once per site and skips disallowed pages. Following RFC 9309:
  - A 4xx `robots.txt`, such as a missing file, allows crawling.
  - A server error or an unreachable `robots.txt` means the site is skipped.
  - `robots.txt` is read whatever content type the server labels it with.
- Redirects are followed inside the fetcher, and the page finally served is checked against its own site's rules. A disallowed redirect target is discarded.
- Public-platform page collectors always enforce robots.txt. Other page collectors can turn this off per run, and the UI warns them to do so only with permission.
- Requests to the same host are at least 0.5 s apart, and longer when the site's `Crawl-delay` asks (honoured up to 10 s).
- Throttling (408, 429) and temporary server or network errors are retried at most twice, with backoff of up to 5 s that honours `Retry-After`.
- OpenStreetMap services get one geocoding request and one Overpass query per run, with an identifying User-Agent, in line with their usage policies.

## Third parties that receive data

| Destination                                                                                                            | When                 | What is sent                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| The websites you crawl                                                                                                 | Every crawl run      | HTTP requests with the Leeds Harvester User-Agent                   |
| nominatim.openstreetmap.org, overpass-api.de (or the public mirror overpass.kumi.systems when the main instance fails) | Local Business Leads | The place name and the business tag                                 |
| oEmbed providers (YouTube, TikTok, Vimeo, X, Reddit, Spotify, SoundCloud, Dailymotion)                                 | Social Post Reader   | The post URL                                                        |
| Your configured AI endpoint                                                                                            | AI Data Extractor    | The instruction plus each page's Markdown (up to 30,000 characters) |

The AI API key comes from the environment. It is sent only to the configured endpoint, and it is never stored in runs, logs or exports.

## Resource limits

| Resource                           | Limit                                                 |
| ---------------------------------- | ----------------------------------------------------- |
| Concurrent runs                    | 2                                                     |
| Pending runs                       | 20                                                    |
| Pages per run                      | 20                                                    |
| Run deadline                       | 60 s (120 s for local leads, 180 s for AI extraction) |
| HTML per page                      | 2 MB (10 MB per feed or sitemap file, decompressed)   |
| Downloaded HTML per run            | 20 MB                                                 |
| Stored, serialized results per run | 20 MB, and at most 10,000 records                     |
| Retained runs                      | Newest 200                                            |
| Tasks, schedules and integrations  | 100 each                                              |
| Request body                       | 32 KB                                                 |

- **Per page:** each extracted field is capped. One page yields at most 2,000 records, and one sitemap file at most 10,000.
- **Downloads:** the download budget is checked before each page, so the page that crosses it is still kept.
- **Compressed sitemaps:** a feed or sitemap body that starts with the gzip magic bytes is decompressed with `maxOutputLength` set to the 10 MB file limit, so a small gzip bomb fails with a log line instead of filling memory. The run's download budget counts the compressed bytes.
- **Retention:** a run that is cancelled but whose worker is still finishing is never removed.
- **Bounded parsing:** Markdown conversion counts every piece of text against its cap, and microdata is read in one bounded pass. Model replies are cleaned with linear string scans. All of these stay fast on hostile pages.

## Output

React renders extracted content as text. JSON and CSV exports keep source fields, and CSV neutralizes spreadsheet formula prefixes. Source URLs are kept as local evidence and are not treated as secrets. Avoid putting credentials in URLs: authenticated crawling is unsupported.

## Independent platform collectors

The new platform collectors do not call Apify or execute imported scraper code. Public HTML parsers accept only declared platform hosts and supported public paths and validate the final URL after redirects. Known login/challenge pages and unsupported/empty public data fail; scripts are parsed as inert data with size/depth limits. Search collectors request visible public search pages, never authenticated or hidden endpoints. No proxy evasion or cookie reuse is available.

Google service keys are read from environment variables at startup, used only in fixed-endpoint request headers and kept out of persisted run inputs, logs and catalog responses. Google request errors omit upstream response bodies/URLs that could disclose credentials. Maps and Custom Search remain disabled until the corresponding configuration is supplied. API integration was tested using injected fixtures; no paid requests were executed. YouTube known-URL oEmbed uses no API key.
