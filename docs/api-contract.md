# Local API contract

All JSON responses use an object envelope. Errors use `{error: string}`. There is no sign-in: one local workspace owns every resource. Mutations require a JSON body and an allowlisted Origin; every request requires a loopback Host.

- `GET /api/health`: health/build mode.
- `GET /api/catalog`: `{actors}`. Actor fields: `id,name,slug,description,category,color,mode,status,notice,owner,fields,documentation`. `mode` is `crawl` or `source`. Status is `ready`, `access-limited` (independent public-page collector with conditional availability), or `requires-provider` with a `notice` explaining what to configure. `fields` declares the actor's input: `{name,type,label,required?,default?,min?,max?,maxLength?,options?,placeholder?,help?}`, with type `urls|number|boolean|select|text|textarea`.
  `documentation` contains `{overview,output:[{name,description}],limitations}` for the README and Output screens. A runnable status indicates an implemented local path, not a live-platform availability guarantee.
- `GET /api/workspace`: `{workspace:{name}}`.
- `GET /api/dashboard`: `{stats:{totalRuns,succeededRuns,failedRuns,runningRuns,totalResults},recentRuns}`.
- `GET /api/runs`: `{runs}` as summaries: `id,actorId,actorName,status,createdAt,startedAt,finishedAt,resultCount,error`.
- `POST /api/runs`: `{actorId,input}` -> `{run}`. `input` must match the actor's catalog `fields`: unknown fields are rejected, defaults are applied, and the normalized input is stored on the run. For crawl actors, `maxPages` defaults to the URL count and must be at least that count. `respectRobots` defaults to `true`.
- `GET /api/runs/:id`: `{run}` with every summary field plus `input,logs,results`.
- `POST /api/runs/:id/abort`: `{run}`.
- `DELETE /api/runs/:id`: deletes a finished run (`SUCCEEDED`, `FAILED`, `ABORTED`) and its records -> `204`. A `QUEUED` or `RUNNING` run, or an aborted run whose worker has not stopped yet, returns `409`: abort it first.
- `GET /api/runs/:id/export?format=json|jsonl|csv`: file download.
- `GET /api/tasks`: `{tasks}`.
- `POST /api/tasks`: `{name,actorId,input}` -> `{task}`. `input` is validated exactly like a run's.
- `PATCH /api/tasks/:id`: any of `{name,input}` -> `{task}`. `input` is validated against the task's actor exactly as on create; the actor cannot change. Schedules keep pointing at the task and run the new input.
- `DELETE /api/tasks/:id`: removes the task and its schedules.
- `POST /api/tasks/:id/run`: starts the saved task -> `{run}`.
- `GET /api/schedules`: `{schedules}`.
- `POST /api/schedules`: `{name,taskId,cron|intervalMinutes,enabled,timezone?}` -> `{schedule}`. Cron uses five standard fields (day-of-week `0`–`7`, both `0` and `7` are Sunday). When both day fields are restricted (neither starts with `*`), either may match. `timezone` is an IANA name (default `UTC`; an unknown name is a 400) and the fields are evaluated in that zone: a wall time skipped by a daylight-saving change does not fire, and a repeated one fires once, the first time.
- `PATCH /api/schedules/:id`: any of `{name,enabled,cron,intervalMinutes,timezone}` -> `{schedule}`. Changing the timing or the zone replans `nextRunAt`.
- `DELETE /api/schedules/:id`: removes the schedule.
- `GET /api/storage`: `{datasets}` derived from actual retained run outputs.
- `GET /api/integrations`: `{integrations}`; local connection preferences only, no external dispatch.
- `POST /api/integrations`: `{name,type,url?}` -> `{integration}`; `url` must pass the public-URL check and is stored only.
- `DELETE /api/integrations/:id`.
- `PATCH /api/settings`: `{name}` -> `{workspace}`.

Run states: `QUEUED,RUNNING,SUCCEEDED,FAILED,ABORTED`. Terminal status is stable after cancellation. Partial failed-page outcomes retain their source-bound error rather than becoming successful fabricated results. Retention and resource limits are enforced by backend: the workspace keeps its newest 200 runs, and a run still held by a worker or the queue is never pruned, even after it is marked `ABORTED`.

## Actor inputs

| Actor                                                                                                                                                | Input                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `website-content`, `page-markdown`, `contact-extractor`, `website-links`, `metadata-extractor`, `structured-data`, `product-data`, `table-extractor` | `urls`, `maxPages?`, `respectRobots?`                                                                                                                                 |
| `custom-selectors`                                                                                                                                   | the above, plus `selectors` (one `name: css [@attr]` per line; `name[]` collects all matches) and `itemSelector?`                                                     |
| `feed-reader`                                                                                                                                        | `urls` (feeds or sitemaps), `respectRobots?`                                                                                                                          |
| `ai-extract`                                                                                                                                         | `urls`, `maxPages?` (1–5), `prompt`, `respectRobots?`. Requires `LEEDS_LLM_BASE_URL` and `LEEDS_LLM_MODEL`.                                                           |
| `local-business-leads`                                                                                                                               | `category` (a catalog option or `custom`), `customTag` (`key=value`, only with `custom`), `place`, `limit?` (1–200, default 50), `findEmails?`                        |
| `social-embeds`                                                                                                                                      | `urls` (1–50 post URLs)                                                                                                                                               |
| `tiktok-scraper`, `instagram-scraper`, `instagram-profile`, `instagram-reel`                                                                         | `urls` (1–50), `limit?` (1–50, default 20). Platform hosts and paths checked before collection and after redirects. Robots always enforced.                           |
| `facebook-search-posts`, `tiktok-search`                                                                                                             | `query` (required, max 300 characters), `limit?` (1–50). Public web search only; restrictions become real run failures.                                               |
| `google-maps-scraper`                                                                                                                                | `query`, `limit?` (1–60). Requires server-side Places API key.                                                                                                        |
| `google-search-scraper`                                                                                                                              | `query`, `limit?` (1–100). Requires eligible server-side Custom Search API key and engine ID.                                                                         |
| `youtube-scraper`                                                                                                                                    | `urls?` (1–50 video URLs), `query?`, `limit?` (1–100); at least URLs or query required. Search/metrics require server-side YouTube API key; URL-only oEmbed does not. |

Records always include `sourceUrl` and `collectedAt`. Platform fields not exposed by a source stay `null`; metadata fallback explicitly identifies `extractionMode`.
