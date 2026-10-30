# Contributing to Leeds Harvester

Thanks for helping. Bug reports, fixes, new scrapers, docs and design improvements are all welcome.

## Set up

```sh
git clone https://github.com/KritishX/leeds-harvester-web-scraper.git
cd leeds-harvester-web-scraper
nvm use          # Node 24.18.0 from .nvmrc; any Node ≥ 24.15 with node:sqlite works
npm ci
npm run dev      # UI at http://leedsharvester.localhost:4180, API on port 4181
```

Before opening a pull request, run:

```sh
npm run lint          # ESLint
npm run format:check  # Prettier (npm run format fixes it)
npm test              # node:test suites (server, API, extractors)
npm run test:ui       # Vitest + Testing Library component tests
npm run test:e2e      # production build + Playwright browser test
npm run build         # TypeScript check + production build
```

`npm run test:e2e` needs a browser once: `npx playwright install chromium`. A repository-wide reformat is listed in `.git-blame-ignore-revs`; run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once so `git blame` skips it.

## Where things live

| Path                    | Owns                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `server/catalog.mjs`    | Every scraper's identity, status and input fields. This is the only place they are declared.                       |
| `server/input.mjs`      | Validates run input against the catalog's fields                                                                   |
| `server/index.mjs`      | HTTP API, run queue, budgets, deadlines, retention, scheduler, static serving                                      |
| `server/crawler.mjs`    | The outgoing-request guard (public addresses, pinned DNS, redirects) and the HTML, XML, text and JSON fetchers     |
| `server/session.mjs`    | Per-run politeness: `robots.txt`, per-host delay, retries with backoff                                             |
| `server/robots.mjs`     | `robots.txt` parsing and matching                                                                                  |
| `server/extractors.mjs` | Turning a fetched page into records: text, contacts, metadata, structured data, products, tables, selectors, feeds |
| `server/markdown.mjs`   | HTML to Markdown                                                                                                   |
| `server/sources.mjs`    | Scrapers that call services instead of crawling pages: OpenStreetMap, oEmbed, the AI model                         |
| `src/main.tsx`          | React UI. Forms are rendered from the catalog's fields.                                                            |
| `docs/`                 | API contract, security model, validation record, capability sources                                                |

## Adding a scraper

1. **Declare it** in `server/catalog.mjs`: give it an id, name, category, description and its input `fields`. Most crawl scrapers can reuse `crawl()`, which adds start URLs, the page limit and the robots.txt option. The UI form and input validation then work without further changes.
2. **Implement it.**
   - A page-based scraper: add a `case` to `extractHtml` in `server/extractors.mjs` that returns `{ records, links }`.
   - A service-based scraper: add `mode: "source"` to the catalog entry and a runner in `server/sources.mjs`, registered in `sourceRunners` in `server/index.mjs`.
3. **Keep the record rules.** Every record has `sourceUrl` and `collectedAt`. Cap every string taken from a page with `clip()`. Never fabricate values: use `null` when a page doesn't state something.
4. **Test it.** Add a fixture test in `tests/crawler.test.mjs` that uses a small page you wrote yourself, and an API test in `tests/api.test.mjs` for anything with its own run logic. External services must be simulated through the `fetchPage`/`fetchJson` options in tests, never called.
5. **Document it** in the README's scraper table, and in [docs/capability-sources.md](docs/capability-sources.md) if the idea came from another project.

Never show sample or made-up records as if they were collected data. A scraper either collects real data, or it stays `requires-provider` with a notice explaining what is missing.

## Ground rules for changes

- **Keep the crawl boundary intact.** Every outgoing request goes through `fetchPublicResource` (or `fetchPublicJson`), so every hop passes `validateUrl` and the DNS check in `publicAddress`. Page fetches go through the run's fetch session, so `robots.txt` and the per-host delay apply. Pull requests that weaken these checks won't be merged.
- **Public data only.** Don't add logins, private or mobile APIs, bot-challenge or CAPTCHA bypass, proxy rotation to evade blocks, or bulk collection of individuals' personal data. See [docs/capability-sources.md](docs/capability-sources.md) for examples of what is and isn't in scope.
- **Respect the limits.** New work must stay within the run, page and byte limits listed in [docs/security-model.md](docs/security-model.md). Use bounded regular expressions. Unbounded patterns such as `+@` can freeze the server.
- **Test behaviour, not wiring.** Prefer tests through the public HTTP API (see `tests/api.test.mjs`). Bug fixes should include a test that fails without the fix.
- **Say only what the code does.** UI text and docs must not claim integrations, delivery or providers that aren't implemented.

## Pull requests

- Keep each pull request focused on one change and describe what changed and how you tested it.
- Use [Conventional Commit](https://www.conventionalcommits.org/) titles, for example `fix(crawler): reject redirects to private hosts`.
- Update `docs/api-contract.md` when an endpoint changes, and `docs/security-model.md` when a boundary or limit changes.

## Reporting bugs and ideas

Open an issue using the bug report or feature request form. For security problems, follow [SECURITY.md](SECURITY.md) and don't open a public issue.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
