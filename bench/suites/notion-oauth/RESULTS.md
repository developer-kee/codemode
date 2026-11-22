# Benchmark: Notion (hosted MCP server, OAuth, read-only), direct MCP vs codemode

- Latency includes the network round trip to Notion, which varies far more than a local server; read the spread (p95), not one median.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** READS the signed-in Notion account (listing and searching pages, users, teams, calendars). It writes nothing. Needs `npm run login -- notion/oauth` first. Results hold sizes and timings only, never page or user content, but the calls themselves do read your workspace.

## TL;DR

Codemode compared with the same server used directly. Left number is codemode, right is direct.

- **Model runs:** none recorded yet.
- **Tool definitions sent every turn:** 450 vs 26,892 tokens (-98%), 39 tools.
- **Latency of one call (no model):** median overhead -4 ms across 17 cases.
- **Verdict (`calls`):** Tool definitions shrink by 98%, but no model runs are recorded, so the effect on tokens, time and correctness is not measured.

_No runs recorded yet._

## Per-tool-call benchmark (no model)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../../README.md](../../README.md).

Generated 2026-11-22. 39 upstream tools, 17 cases over 17 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service notion-oauth --iters 10`.

### Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| notion-query-data-sources | 7,148 | 6 | 5,041 | no |
| notion-query-meeting-notes | 3,654 | 7 | 2,542 | no |
| notion-search | 1,844 | 3 | 1,436 | yes |
| notion-query-sessions | 1,373 | 5 | 1,652 | no |
| notion-fetch | 989 | 3 | 964 | no |
| notion-query-multiple-data-sources | 920 | 9 | 977 | no |
| notion-get-comments | 771 | 5 | 741 | no |
| notion-get-version-changes | 684 | 7 | 776 | no |
| notion-calendar-list-calendar-resources | 615 | 10 | 527 | no |
| notion-get-tool-access | 550 | 6 | 511 | yes |
| notion-view-version | 434 | 5 | 392 | no |
| notion-get-users | 426 | 4 | 379 | yes |
| notion-search-agents | 406 | 5 | 361 | no |
| notion-list-page-backlinks | 388 | 7 | 507 | no |
| notion-download-attachment | 373 | 7 | 356 | no |
| notion-list-session-events | 369 | 7 | 303 | no |
| notion-get-file-download-urls | 358 | 7 | 334 | no |
| notion-get-groups | 355 | 4 | 331 | yes |
| notion-get-async-task | 322 | 5 | 296 | no |
| notion-memory-search | 307 | 5 | 258 | yes |
| notion-read-session-event | 294 | 6 | 252 | no |
| notion-wait-session | 287 | 5 | 245 | no |
| notion-calendar-list-coworkers-events | 285 | 9 | 234 | no |
| notion-calendar-list-events | 279 | 7 | 233 | yes |
| notion-search-sessions | 271 | 6 | 244 | no |
| notion-list-recent-pages | 271 | 6 | 242 | yes |
| notion-get-teams | 264 | 4 | 243 | yes |
| notion-get-session-status | 261 | 6 | 235 | no |
| notion-list-private-pages | 248 | 6 | 221 | yes |
| notion-list-shared-pages | 246 | 6 | 218 | yes |
| notion-get-suggested-edit | 245 | 6 | 215 | no |
| notion-calendar-list-calendars | 238 | 8 | 212 | yes |
| notion-get-sidebar-tabs | 223 | 6 | 202 | yes |
| notion-list-favorite-pages | 219 | 7 | 192 | yes |
| notion-calendar-list-contacts | 211 | 7 | 185 | yes |
| notion-download-skill | 209 | 5 | 180 | no |
| notion-get-enabled-skills | 199 | 6 | 180 | yes |
| notion-get-setup-guide | 183 | 6 | 162 | yes |
| notion-get-self | 179 | 4 | 155 | yes |
| **Total sent every turn** | **26,892** | **450** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 7,148 tokens, 27% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **1,407 characters** (fits), listing every function at detail level 3 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../../README.md).

### Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| notion-get-self | 313 | 363 | 302 | 353 | -12 ms | 201 | 260 | 0/0 |
| notion-get-users | 298 | 315 | 285 | 294 | -13 ms | 376 | 540 | 0/0 |
| notion-get-teams | 271 | 388 | 267 | 606 | -4.5 ms | 50 | 71 | 0/0 |
| notion-get-groups | 242 | 302 | 250 | 286 | +7.3 ms | 30 | 47 | 0/0 |
| notion-get-tool-access | 282 | 632 | 281 | 306 | -1.1 ms | 7,949 | 9,508 | 0/0 |
| notion-get-enabled-skills | 252 | 290 | 241 | 285 | -11 ms | 13 | 26 | 0/0 |
| notion-get-setup-guide | 251 | 301 | 258 | 354 | +6.7 ms | 10,516 | 10,529 | 0/0 |
| notion-get-sidebar-tabs | 287 | 479 | 275 | 1836 | -11 ms | 5,357 | 7,782 | 0/0 |
| notion-search | 500 | 771 | 518 | 1437 | +18 ms | 2,165 | 2,664 | 0/0 |
| notion-memory-search | 251 | 267 | 244 | 265 | -7.4 ms | 14 | 27 | 0/0 |
| notion-list-private-pages | 275 | 442 | 273 | 301 | -1.5 ms | 664 | 870 | 0/0 |
| notion-list-shared-pages | 291 | 543 | 285 | 1317 | -5.5 ms | 14 | 27 | 0/0 |
| notion-list-favorite-pages | 256 | 335 | 289 | 321 | +33 ms | 406 | 532 | 0/0 |
| notion-list-recent-pages | 323 | 1239 | 306 | 5518 | -17 ms | 762 | 976 | 0/0 |
| notion-calendar-list-calendars | 703 | 1319 | 753 | 945 | +50 ms | 1,960 | 2,818 | 0/0 |
| notion-calendar-list-contacts | 478 | 602 | 493 | 574 | +15 ms | 8,374 | 16,622 | 0/0 |
| notion-calendar-list-events | 1049 | 1522 | 1033 | 1537 | -16 ms | 3,589 | 5,438 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 0.8 ms, p95 1.1 ms. This is the floor of codemode's per-call overhead.

### Coverage

Cases cover 17 of 39 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
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

### `calls`

