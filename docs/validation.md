# Validation record

This record lists checks that were actually run, with their scope and limits. Last updated 2026-10-23 for version 0.2.0.

## Automated tests

`npm test` runs 31 `node:test` tests (Node 26.7.0 locally; `.nvmrc` pins 24.18.0). All pass in about 1.6 s. External services are simulated in these tests and never called.

| Area                         | Establishes                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace workflow           | No sign-in; Origin and Host guards (403); private-URL rejection; a scraper that needs a provider refuses to run; a real worker run; CSV formula neutralization; tasks, cron schedules, integration preferences; abort; persistence across a server restart; start URLs above `maxPages` rejected                                              |
| Run lifecycle                | Retention never removes a run its worker still holds (fails without the fix); schedule edits replan only timing; cron day-field OR semantics                                                                                                                                                                                                  |
| Fetch session                | A 503 is retried with backoff, a 404 is not, and there is one `robots.txt` request per site per run. Disallowed pages are skipped and explained, with an override. A `robots.txt` server error skips the site. A redirect to a disallowed path is discarded.                                                                                  |
| Budgets                      | The page that crosses the 20 MB download budget keeps its records (12, not 11). Sitemaps may be up to 10 MB while pages stay at 2 MB. The 10,000-record limit applies per run.                                                                                                                                                                |
| Scrapers, end to end         | Feed reader and JSONL export; sitemap indexes followed within the file limit and only on the same site                                                                                                                                                                                                                                        |
| Local Business Leads         | Overpass query shape, addresses, ODbL attribution and email lookup. Leads survive a cancel during website lookups (the test takes 8 ms). The mirror is used when the main instance fails, and the run reports a clear error when both fail.                                                                                                   |
| Social Post Reader           | oEmbed metadata; unsupported providers skipped with a log line                                                                                                                                                                                                                                                                                |
| AI Data Extractor            | Sends the page Markdown and the instruction to the configured endpoint, with a system prompt marking the page as untrusted. It stores the parsed JSON, and the API key never appears in the stored run.                                                                                                                                       |
| Extractors                   | Text, Markdown (headings, nested lists, tables, code, safe links only), contacts (including schema.org data), metadata, JSON-LD, microdata, Open Graph, products, tables (unique headers, layout tables skipped), custom selectors (attributes, repeating items, invalid specs rejected), RSS, Atom and sitemaps                              |
| Parsers                      | `robots.txt` group selection, longest match, Allow ties and wildcards without regular expressions; catalog-driven input validation; model-reply JSON with fences and reasoning blocks                                                                                                                                                         |
| Boundaries and hostile input | Private, encoded, IPv6, credential and non-standard-port URLs rejected; email matching linear on 200,000 address characters; field caps. Each of these finishes inside 0.2–3 s: 300 nested tables over 1.5 MB, 100 nested microdata items over 100,000 properties, 10,000-deep microdata, a 200,000-space model reply, 50,000 reasoning tags. |
| Configuration                | An AI base URL containing credentials is rejected; a charset declared in a `<meta>` tag or XML declaration is honoured                                                                                                                                                                                                                        |

`npm run build` (TypeScript check plus Vite production build) passes, and `tsc --noUnusedLocals` is clean.

## Live checks (2026-10-23)

Each scraper was run once through the production server's API against small public targets, from this machine:

| Scraper                 | Target                                                                   | Result                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page to Markdown        | example.com                                                              | ✓ 1 record                                                                                                                                                                                                                                 |
| Custom Selector Scraper | quotes.toscrape.com (a site built for scraping practice), `.quote` items | ✓ 10 records with author, author link, tags                                                                                                                                                                                                |
| Table Extractor         | A Wikipedia list page                                                    | ✓ 379 rows                                                                                                                                                                                                                                 |
| Feed & Sitemap Reader   | Hacker News RSS                                                          | ✓ 30 items. The run took 12 s because the site's 30 s `Crawl-delay` was honoured up to the 10 s cap.                                                                                                                                       |
| Feed & Sitemap Reader   | sitemaps.org sitemap                                                     | ✓ 84 URLs                                                                                                                                                                                                                                  |
| Feed & Sitemap Reader   | GOV.UK sitemap index, file limit 2                                       | ✓ 35 sitemaps listed, then the 5.4 MB child read; the run stopped cleanly at 10,000 records                                                                                                                                                |
| Structured Data Reader  | A GitHub repository page                                                 | ✓ 4 records (microdata, Open Graph)                                                                                                                                                                                                        |
| Product Data Extractor  | An Allbirds product page                                                 | ✓ name, price 100 USD, InStock. A scrapingcourse.com product page was correctly skipped because its `robots.txt` disallows it.                                                                                                             |
| Public Contact Finder   | iana.org contact page                                                    | ✓ 1 record                                                                                                                                                                                                                                 |
| Page Metadata Reader    | developer.mozilla.org                                                    | ✓ language, H1, canonical URL                                                                                                                                                                                                              |
| Local Business Leads    | Dentists in Leeds, email lookup on                                       | ✓ 8 businesses. During a separate Overpass outage the run failed with HTTP 502 or a timeout; the main instance and the mirrors were all unreachable, while Nominatim and other sites answered. It succeeded again once Overpass recovered. |
| Social Post Reader      | YouTube, TikTok, X, Dailymotion, Reddit, Vimeo URLs                      | ✓ 5 of 6. Vimeo returned 404 for the sample video.                                                                                                                                                                                         |
| AI Data Extractor       | —                                                                        | Correctly refused to run without `LEEDS_LLM_BASE_URL` and `LEEDS_LLM_MODEL`, showing setup instructions                                                                                                                                    |

The screenshots in [`screenshots/`](screenshots/) were taken with headless Chrome against the workspace these live runs produced.

Earlier checks from 0.1 still apply:

- No crawler sockets stay open after error responses.
- Vite refuses the database files and foreign-origin CORS.
- An oversize request body gets a 413 response instead of a reset connection.

## Security review

The review followed Cloudflare's `security-audit` skill in guidance mode. Independent read-only reviewers covered the 0.1 backend and frontend, and then the 0.2 engine.

The 0.2 review produced seven findings plus two lower-severity ones. All are fixed and regression-tested:

| Finding                                                                     | Fix                                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Nested tables made Markdown conversion take 35 s and about 2 GB             | Rows belong only to their own table; all text counts against the cap |
| Microdata reading was super-linear (170 s for one page)                     | One bounded walk with property and text-work caps                    |
| Model-reply parsing was quadratic (43 s)                                    | Linear string scans                                                  |
| Leads were lost if the deadline hit during website lookups                  | Leads are saved first; lookups have their own shorter deadline       |
| Sitemap indexes were never followed despite the UI text                     | Feed reader has a file limit that enables following                  |
| The page crossing the download budget lost its records                      | The budget is checked before each page                               |
| `robots.txt` failures allowed crawling, and redirect targets were unchecked | RFC 9309 failure handling; the final URL is checked                  |
| An API key inside the base URL could reach run logs                         | Such URLs are rejected at startup                                    |
| A charset in `<meta>` or the XML declaration was ignored                    | It is now honoured                                                   |

Findings from the 0.1 reviews remain fixed (email ReDoS, dev-server data exposure, stored-result budget, retention and abort race, socket cleanup, start-URL handling).

Checked and rejected by the reviewers:

- SSRF through redirects, POST requests, sitemap children, OSM websites or oEmbed URLs
- Overpass query injection
- `robots.txt` matcher backtracking
- Model output driving fetches
- Static path traversal, CSV injection, DNS rebinding, CSRF and XSS from scraped content

## Not verified

- A real AI provider: AI extraction was tested only against a simulated OpenAI-compatible server.
- The Overpass mirror (`overpass.kumi.systems`), which was unreachable during the outage when it was probed.
- Vimeo oEmbed with a currently public video; Spotify and SoundCloud oEmbed.
- Node 24.18.0 specifically (tests ran on Node 26.7.0), and mobile views beyond the shared scraper Input/README workspace.
- Load and long-running schedules, and sites other than those listed above.

## Scraper workspace and independent platform collectors

Final local gate: `npm test && npm run build && git diff --check` passed with **56 tests, 0 failures** on Node 26.7.0. REA CLI evidence checked all 22 scraper pages and their five shared tabs. CUA checked the Form/JSON round trip, malformed JSON blocking a run, README navigation preserving input, task creation displaying the configured target, and a 390 × 844 mobile view with document width 390. The temporary UI QA task was removed after the saved task and configured target were verified.

The independent YouTube known-video URL path completed a live run with one record. Six social page samples failed because of robots restrictions or unavailable structured data; Maps/Search were not run without Google credentials. Their tests use controlled public-page/API fixtures and do not establish live availability. [Full evidence and limitations](scraper-workspace-validation.md).
