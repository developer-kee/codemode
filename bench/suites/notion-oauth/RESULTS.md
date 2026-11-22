# Benchmark: Notion (hosted MCP server, OAuth), direct MCP vs codemode

- Latency includes the network round trip to Notion, which varies far more than a local server; read the spread (p95), not one median.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** Needs `npm run login -- notion/oauth` first. The per-call cases only READ the signed-in account. The `scenarios` variant WRITES: it creates a private top-level "codemode bench <timestamp>" page with a 40-row database and moves older "codemode bench" pages to the trash (matched by that exact title prefix). The wrapper has its write tools on in this benchmark, so a model could change other pages; the scenario tasks only read. Use a test workspace if you can. Models can search the whole account, so they may read other pages while looking; nothing they read is saved in the results.

## TL;DR

Codemode compared with the same server used directly. Left number is codemode, right is direct.

- **`scenarios`, `claude-sonnet-5-5`:** tokens **-89%** (50,589 vs 459,735), time **-3%** (13.6s vs 14.0s), cost **-64%** ($0.095 vs $0.268), passed 5/6 vs 6/6.
- **Tool definitions sent every turn:** 573 vs 58,037 tokens (-99%), 77 tools.
- **Latency of one call (no model):** median overhead -6 ms across 17 cases.
- **Verdict (`scenarios`):** Codemode passed fewer runs than direct. Read the failed runs below before trusting the savings.

## Models

Detailed results below are grouped by model family. Each family is produced by one runner and uses the same tasks and prompts; token counts are comparable within a family, not necessarily across runners, because each harness sends its own system prompt and tool guidance.

| Model | Provider | Runner | Runs | Variants |
|---|---|---|---|---|
| `claude-sonnet-5-5` | Claude | `claude` | 12 | `scenarios` |

## Variant: `scenarios`, multi-step read-only scenario tasks

- Both paths expose all 77 tools of Notion's hosted server, write tools included, which is the wrapper's default. The scenario tasks only read.
- The "direct" path is a pass-through stdio bridge (`bench<path>`) that uses the same saved sign-in, because the hosted server needs OAuth and the harness starts stdio servers.
- `status-count` and `owner-load` are the same tasks, on the same seeded 40-row database, as the self-hosted Notion suite, so the two Notion servers can be compared on identical work. `write-summary` is left out: this wrapper cannot write.
- Partway through the runs Notion reported that the account's "Query Data Source" allowance was used up, and both paths fell back to reading the database page instead. That is an account limit, not the wrapper, and it makes later runs take more turns on both sides; repeat on a fresh allowance for cleaner numbers.
- One early codemode `status-count` run is recorded as failed only because the model wrote "Seven" instead of "7". The check now accepts numbers written as words; the record is left as it was run.
- The data is seeded through the hosted server itself (no integration token), then the model reads it with the server's own search and fetch tools. The report holds task prompts, token counts and pass/fail only, not workspace content.

Reproduce: `npm run bench -- --service notion-oauth --variant scenarios --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| status-count | 3/3 / 2/3 | 474,825 | 44,928 | **-91%** | 14.4s | 12.9s | **-11%** | $0.359 | $0.096 |
| owner-load | 3/3 / 3/3 | 444,645 | 56,251 | **-87%** | 13.6s | 14.4s | **6%** | $0.176 | $0.095 |

Token change ranges from **-91%** (status-count) to **-87%** (owner-load).

##### Task: status-count

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 5.0 | 4.0 | 91,753 | 603 | 36,425 | 437,797 | 474,825 | $0.359 | 14.4s |
| codemode | 2/3 | 5.0 | 4.0 | 1,646 | 614 | 12,911 | 31,403 | 44,928 | $0.096 | 12.9s |

##### Task: owner-load

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 4.7 | 3.7 | 91,748 | 503 | 6,225 | 437,916 | 444,645 | $0.176 | 13.6s |
| codemode | 3/3 | 6.0 | 5.0 | 1,641 | 785 | 11,657 | 43,808 | 56,251 | $0.095 | 14.4s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 6/6 | 4.8 | 3.8 | 91,751 | 553 | 21,325 | 437,857 | 459,735 | $0.268 | 14.0s |
| codemode | 5/6 | 5.5 | 4.5 | 1,644 | 700 | 12,284 | 37,606 | 50,589 | $0.095 | 13.6s |

Total tokens, codemode vs direct: **-89%** (50,589 vs 459,735).

Wall time, codemode vs direct: **-3%** (13.6s vs 14.0s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

##### Failed runs

| Task | Path | Repeat | Reason |
|---|---|---|---|
| status-count | codemode | 2 | answer lacks Done count 7: Seven tasks have the Status Done, and the highest Priority among the Doing tasks is 10 (Task  |

## Per-tool-call benchmark (no model)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../../README.md](../../README.md).

Generated 2026-11-22. 77 upstream tools, 17 cases over 17 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service notion-oauth --iters 10`.

### Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| notion-query-data-sources | 7,148 | 6 | 5,041 | no |
| notion-query-meeting-notes | 3,654 | 7 | 2,542 | no |
| notion-update-page | 2,793 | 5 | 2,517 | no |
| notion-create-comment | 2,669 | 5 | 1,970 | no |
| notion-create-pages | 2,583 | 5 | 2,292 | no |
| notion-update-data-source | 2,415 | 6 | 1,966 | no |
| notion-update-sidebar-tabs | 2,307 | 7 | 2,815 | no |
| notion-calendar-update-events | 1,876 | 7 | 1,113 | no |
| notion-search | 1,844 | 3 | 1,436 | yes |
| notion-calendar-create-events | 1,386 | 7 | 820 | no |
| notion-query-sessions | 1,373 | 5 | 1,652 | no |
| notion-create-database | 1,272 | 6 | 1,243 | no |
| notion-create-view | 1,261 | 5 | 1,209 | no |
| notion-fetch | 989 | 3 | 964 | no |
| notion-create-attachment | 984 | 6 | 928 | no |
| notion-query-multiple-data-sources | 920 | 9 | 977 | no |
| notion-update-view | 836 | 5 | 804 | no |
| notion-create-meeting-note | 824 | 7 | 598 | no |
| notion-get-comments | 771 | 5 | 741 | no |
| notion-restore-version | 696 | 6 | 624 | no |
| notion-get-version-changes | 684 | 7 | 776 | no |
| notion-upload-skill | 682 | 5 | 564 | no |
| notion-move-pages | 622 | 4 | 481 | no |
| notion-calendar-list-calendar-resources | 615 | 10 | 527 | no |
| notion-update-page-favorites | 603 | 7 | 475 | no |
| notion-update-skill-settings | 550 | 7 | 475 | no |
| notion-get-tool-access | 550 | 6 | 511 | yes |
| notion-create-file-upload | 471 | 6 | 433 | no |
| notion-update-folder | 450 | 5 | 404 | no |
| notion-create-suggested-edit | 446 | 7 | 391 | no |
| notion-view-version | 434 | 5 | 392 | no |
| notion-delete-databases | 427 | 6 | 811 | no |
| notion-get-users | 426 | 4 | 379 | yes |
| notion-link-meeting-note-to-calendar-event | 422 | 11 | 332 | no |
| notion-search-agents | 406 | 5 | 361 | no |
| notion-delete-pages | 393 | 5 | 776 | no |
| notion-list-page-backlinks | 388 | 7 | 507 | no |
| notion-download-attachment | 373 | 7 | 356 | no |
| notion-list-session-events | 369 | 7 | 303 | no |
| notion-create-folder | 365 | 5 | 287 | no |
| notion-get-file-download-urls | 358 | 7 | 334 | no |
| notion-get-groups | 355 | 4 | 331 | yes |
| notion-calendar-cancel-events | 353 | 7 | 259 | no |
| notion-get-async-task | 322 | 5 | 296 | no |
| notion-update-comment | 322 | 5 | 283 | no |
| notion-memory-search | 307 | 5 | 258 | yes |
| notion-convert-to-meetings-database | 307 | 9 | 263 | no |
| notion-read-session-event | 294 | 6 | 252 | no |
| notion-set-discussion-resolved | 291 | 8 | 256 | no |
| notion-wait-session | 287 | 5 | 245 | no |
| notion-calendar-list-coworkers-events | 285 | 9 | 234 | no |
| notion-resolve-suggested-edit | 285 | 7 | 248 | no |
| notion-send-message-to-session | 284 | 8 | 250 | no |
| notion-calendar-list-events | 279 | 7 | 233 | yes |
| notion-search-sessions | 271 | 6 | 244 | no |
| notion-list-recent-pages | 271 | 6 | 242 | yes |
| notion-restore-pages | 265 | 5 | 652 | no |
| notion-get-teams | 264 | 4 | 243 | yes |
| notion-duplicate-page | 263 | 5 | 238 | no |
| notion-set-comment-reaction | 261 | 7 | 219 | no |
| notion-get-session-status | 261 | 6 | 235 | no |
| notion-spawn-session | 260 | 5 | 221 | no |
| notion-stop-session | 254 | 5 | 226 | no |
| notion-delete-comment | 248 | 5 | 216 | no |
| notion-list-private-pages | 248 | 6 | 221 | yes |
| notion-list-shared-pages | 246 | 6 | 218 | yes |
| notion-get-suggested-edit | 245 | 6 | 215 | no |
| notion-calendar-list-calendars | 238 | 8 | 212 | yes |
| notion-convert-page-to-skill | 229 | 7 | 199 | no |
| notion-get-sidebar-tabs | 223 | 6 | 202 | yes |
| notion-list-favorite-pages | 219 | 7 | 192 | yes |
| notion-calendar-list-contacts | 211 | 7 | 185 | yes |
| notion-download-skill | 209 | 5 | 180 | no |
| notion-get-enabled-skills | 199 | 6 | 180 | yes |
| notion-complete-mcp-setup | 192 | 6 | 158 | no |
| notion-get-setup-guide | 183 | 6 | 162 | yes |
| notion-get-self | 179 | 4 | 155 | yes |
| **Total sent every turn** | **58,037** | **573** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 7,148 tokens, 12% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **1,898 characters** (fits), listing every function at detail level 4 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../../README.md).

### Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| notion-get-self | 239 | 287 | 272 | 418 | +33 ms | 201 | 260 | 0/0 |
| notion-get-users | 281 | 362 | 301 | 311 | +20 ms | 376 | 540 | 0/0 |
| notion-get-teams | 260 | 479 | 279 | 441 | +19 ms | 50 | 71 | 0/0 |
| notion-get-groups | 274 | 446 | 257 | 285 | -17 ms | 30 | 47 | 0/0 |
| notion-get-tool-access | 295 | 379 | 297 | 2669 | +2.4 ms | 7,942 | 9,501 | 0/0 |
| notion-get-enabled-skills | 262 | 310 | 253 | 300 | -8.5 ms | 13 | 26 | 0/0 |
| notion-get-setup-guide | 262 | 433 | 239 | 530 | -23 ms | 10,516 | 10,529 | 0/0 |
| notion-get-sidebar-tabs | 319 | 590 | 280 | 6680 | -39 ms | 5,357 | 7,782 | 0/0 |
| notion-search | 465 | 709 | 481 | 560 | +17 ms | 2,153 | 2,652 | 0/0 |
| notion-memory-search | 260 | 277 | 238 | 396 | -22 ms | 14 | 27 | 0/0 |
| notion-list-private-pages | 274 | 424 | 269 | 299 | -5.0 ms | 664 | 870 | 0/0 |
| notion-list-shared-pages | 331 | 591 | 345 | 605 | +15 ms | 14 | 27 | 0/0 |
| notion-list-favorite-pages | 312 | 876 | 286 | 320 | -26 ms | 406 | 532 | 0/0 |
| notion-list-recent-pages | 323 | 617 | 317 | 516 | -6.4 ms | 650 | 848 | 0/0 |
| notion-calendar-list-calendars | 703 | 1832 | 910 | 3318 | +207 ms | 1,960 | 2,818 | 0/0 |
| notion-calendar-list-contacts | 508 | 555 | 494 | 578 | -14 ms | 8,374 | 16,622 | 0/0 |
| notion-calendar-list-events | 1086 | 1369 | 1060 | 1399 | -27 ms | 3,589 | 5,438 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 0.9 ms, p95 1.3 ms. This is the floor of codemode's per-call overhead.

### Coverage

Cases cover 17 of 77 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| notion-create-attachment | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-create-file-upload | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-create-pages | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-update-page | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-delete-pages | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-delete-databases | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-restore-pages | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-convert-page-to-skill | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-upload-skill | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-update-skill-settings | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-complete-mcp-setup | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-move-pages | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-duplicate-page | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-create-database | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-create-folder | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-update-folder | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-update-data-source | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-create-comment | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-update-comment | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-delete-comment | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-set-discussion-resolved | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-set-comment-reaction | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-create-suggested-edit | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-resolve-suggested-edit | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-spawn-session | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-stop-session | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-send-message-to-session | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-create-view | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-update-view | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-restore-version | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-update-sidebar-tabs | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-update-page-favorites | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-calendar-create-events | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-calendar-update-events | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-calendar-cancel-events | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-link-meeting-note-to-calendar-event | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-convert-to-meetings-database | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-create-meeting-note | Changes the workspace, so it is not timed against a live account. The seed step exercises create-pages and create-database. |
| notion-query-meeting-notes | Answers "requires a Business plan" on other plans, so its latency would depend on the account, not the wrapper. |
| notion-query-sessions | Answers "requires a Business plan" on other plans, so its latency would depend on the account, not the wrapper. |
| notion-fetch | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-get-comments | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-get-suggested-edit | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-get-version-changes | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-view-version | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-list-page-backlinks | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-query-data-sources | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-query-multiple-data-sources | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-download-attachment | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-get-file-download-urls | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-download-skill | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-get-async-task | Needs an id or URL from an earlier read of the workspace, which this run does not keep. |
| notion-search-agents | Agent sessions: needs a session that exists, or waits on one. |
| notion-search-sessions | Agent sessions: needs a session that exists, or waits on one. |
| notion-get-session-status | Agent sessions: needs a session that exists, or waits on one. |
| notion-wait-session | Agent sessions: needs a session that exists, or waits on one. |
| notion-list-session-events | Agent sessions: needs a session that exists, or waits on one. |
| notion-read-session-event | Agent sessions: needs a session that exists, or waits on one. |
| notion-calendar-list-coworkers-events | Needs coworker emails or room-booking input that depend on the workspace. |
| notion-calendar-list-calendar-resources | Needs coworker emails or room-booking input that depend on the workspace. |

### Cases

| Case | Arguments | Model prompt |
|---|---|---|
| notion-get-self | `{}` | latency only |
| notion-get-users | `{"page_size":5}` | latency only |
| notion-get-teams | `{}` | latency only |
| notion-get-groups | `{}` | latency only |
| notion-get-tool-access | `{}` | latency only |
| notion-get-enabled-skills | `{}` | latency only |
| notion-get-setup-guide | `{}` | latency only |
| notion-get-sidebar-tabs | `{}` | latency only |
| notion-search | `{"query":"notes","page_size":5}` | latency only |
| notion-memory-search | `{"query":"notes","limit":5}` | latency only |
| notion-list-private-pages | `{"limit":5}` | latency only |
| notion-list-shared-pages | `{"limit":5}` | latency only |
| notion-list-favorite-pages | `{"limit":5}` | latency only |
| notion-list-recent-pages | `{"limit":5}` | latency only |
| notion-calendar-list-calendars | `{}` | latency only |
| notion-calendar-list-contacts | `{}` | latency only |
| notion-calendar-list-events | `{"timeMin":"2026-11-01T00:00:00Z","timeMax":"2026-11-08T00:00:00Z","timeZone":"UTC"}` | latency only |

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `scenarios`

- **status-count** (pre-seeded): The Notion workspace has a database titled "Bench Tasks" on a page whose title starts with "codemode bench". Each task has a Name, a Status (Todo, Doing or Done), a Priority number and an Owner. How many tasks have the Status Done, and what is the highest Priority among the tasks whose Status is Doing? Reply with one short sentence.
- **owner-load** (pre-seeded): The Notion workspace has a database titled "Bench Tasks" on a page whose title starts with "codemode bench". Each task has a Name, a Status (Todo, Doing or Done), a Priority number and an Owner. Which Owner has the most tasks that are not yet Done, and how many open tasks do they have? Reply with one short sentence.

### `calls`

