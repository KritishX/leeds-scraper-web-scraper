# Scraper workspace: REA evidence and validation

This is an independent implementation in Leeds Harvester. The UI was adapted from observed Apify screens using the existing charcoal/lime theme. No Apify Actor is called, and no private scraper backend was recovered.

## What was inspected

- Reference Input: https://console.apify.com/actors/shu8hvrXbJbY3Eb9W/input
- Reference README: https://console.apify.com/actors/shu8hvrXbJbY3Eb9W/info/readme?build=latest
- CUA inspection of the existing user browser session established the actual Input and README layouts: actor header/actions, form/JSON editors, URL rows and bulk editing, input controls, documentation headings and table of contents. No reference Actor was started.
- REA MCP tools were absent. The installed checkout had no compiled runtime, so the REA 6.7.0 CLI was used through the package registry, without changing client registration. Doctor reported registration drift; CLI work did not depend on registration repair.

## REA evidence ledger

| Evidence                                                              | Observation                                                                                                                                  | Limits                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ev_6f4bfe741ff51c9c7eee984c7e286488b17842a5b39eb245f46fec53e569fa7e` | Controlled public Input/README browser navigation, owned temporary Brave profile; cleanup completed                                          | The fresh logged-out profile redirected to sign-in. This evidence does not establish the authenticated actor UI. |
| `ev_e9c0007f06f9cb624b25f1b0c501bcaadec390dab41c8c0acf137b9d87dcb49b` | Inventoried the public 1,139,003-byte entry bundle, SHA-256 `78aa66c1da844a9201d0a1586176570e9d0055f7d6061679695e1aa49c1bda97`               | Entry semantic analysis exhausted its 512 MiB worker heap. Complete frontend architecture was not recovered.     |
| `ev_ea96241e23d6acda82e3bda7445950d58e84d2a135e076d9b8d43b52ba91534b` | Inert analysis of three exact control chunks referenced by that entry, 45,235 bytes total; 3 JavaScript files parsed, 0 parse failures       | Dependencies were not acquired; static facts do not prove runtime execution or proprietary scraper behavior.     |
| `ev_2ab12dae9003a645233f61efa8879ad87b9c515ebc61bb2d1ad20fccb2a37441` | Live controlled navigation across all 22 local actor pages; each actual DOM has the expected title and Input/README/Output/Runs/API controls | Rendering checks do not establish live platform extraction. Owned browser terminated after capture.              |

Complete Evidence JSON and downloaded public artifacts remain in local ignored `data/rea/`; they are not bundled into the product or committed. The smaller controls were analyzed to answer the UI question, not to retry the large entry under the same failed budget.

## UI delivery

- One catalog-driven page for every existing and new actor, including field-specific README, output field reference and a current-input API request.
- Form/JSON round trips preserve comma-containing URLs; invalid JSON and wrong shapes are rejected before task/run creation.
- Individual URL rows, bulk edit, add/remove, run options, defaults reset and saving named tasks use existing endpoints.
- API examples include the required local Origin header; no credentials are shown.
- Dataset columns no longer stop at the first seven returned keys.
- Responsive CUA check: 390 × 844 viewport, document width 390, preserved form URL across JSON and README navigation. Desktop and mobile screenshots are in docs/screenshots/.

## Automated and live validation

- `npm test`: all 56 tests pass (final gate recorded separately in validation.md). New checks cover the catalog and JSON editor, platform parsers, Google APIs through fixtures, nine public HTTP run flows, robots failures, retained partial results at the source download budget, and credential-bearing redirect rejection.
- `npm run build`: TypeScript and Vite build pass. React Router emits its existing ignored `use client` bundler warnings.
- The saved-task UI was exercised and the temporary QA task removed. No tests call paid Google APIs. Injected fixture success proves local request/validation/worker/output wiring, not external service availability.

| New scraper             | Live local result                                                                                                                                                                                | Next requirement / limit                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `tiktok-scraper`        | No public platform records collected. No supported public records were embedded in this page. JavaScript-only, login-walled and changed schemas cannot be extracted; use a different public URL. | No login, private API or protection bypass implemented                   |
| `instagram-scraper`     | No public platform records collected. disallowed by robots.txt: https://www.instagram.com/p/DZxvMgyH8yR/                                                                                         | No login, private API or protection bypass implemented                   |
| `instagram-profile`     | No public platform records collected. disallowed by robots.txt: https://www.instagram.com/instagram/                                                                                             | No login, private API or protection bypass implemented                   |
| `instagram-reel`        | No public platform records collected. disallowed by robots.txt: https://www.instagram.com/reel/CigMSGeD4Hd/                                                                                      | No login, private API or protection bypass implemented                   |
| `facebook-search-posts` | No public platform records collected. disallowed by robots.txt: https://www.facebook.com/search/posts/?q=Nepal+bakery                                                                            | No login, private API or protection bypass implemented                   |
| `tiktok-search`         | No public platform records collected. disallowed by robots.txt: https://www.tiktok.com/search?q=Nepal+bakery                                                                                     | No login, private API or protection bypass implemented                   |
| `youtube-scraper`       | Succeeded: 1 source-backed record                                                                                                                                                                | URL-only oEmbed; additional statistics/search need a YouTube API key     |
| `google-maps-scraper`   | Not run live; fixture-tested                                                                                                                                                                     | Requires enabled Google Places API key and billing                       |
| `google-search-scraper` | Not run live; fixture-tested                                                                                                                                                                     | Requires an eligible existing Google Custom Search API key and engine ID |

The public-page six are labelled `access-limited` in the catalog and interface. A run preserves a real access/parse failure instead of manufacturing a record. Maps/Search use `requires-provider` while unconfigured. These nine adapters do not have full Apify feature parity and are not all verified live-working.

## Primary capability sources

- [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search) and [API setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key).
- [Google Custom Search overview](https://developers.google.com/custom-search/v1/overview): closed to new customers, ending January 1, 2027.
- [YouTube search API](https://developers.google.com/youtube/data/reference/rest/v3/search/list) and [video resource API](https://developers.google.com/youtube/data/reference/rest/v3/videos/list).
- [TikTok public embed documentation](https://developers.tiktok.com/doc/embed-videos). Its oEmbed endpoint is a metadata source, not a substitute for search, profile history or hidden metrics.

Skipped: paid/credentialed Google integration, authentication flows, CAPTCHA/proxy bypass, proprietary backend recovery, public deployment and Git push. Live source restrictions and missing credentials remain the material delivery limits.
