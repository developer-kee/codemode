# Benchmark: Playwright (browser, local test site), direct MCP vs codemode

- Both paths launch the same pinned `@playwright/mcp@0.0.86` (headless Edge, isolated profile, restricted to the local fixture origin) and see the same 24 tools; the browser starts fresh for every run.
- Tasks run against a deterministic local website (150-row catalog, a form, a 6-page ratings list), so results do not depend on the internet.
- Pass/fail comes from the fixture itself: the form task checks what the server received; the other tasks check the answer against values computed from the fixture data.
- Unlike Blender and Windows, these tasks return large page snapshots (the catalog is one big table), so they exercise filtering big tool results in code, which is the case Code Mode is designed for.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `calls`. Method, metric definitions and limitations: [../README.md](../README.md).

> **Warning:** Drives a real headless Microsoft Edge (already installed; nothing is downloaded) against a small local site on http://127.0.0.1:4817, and the browser is limited to that origin with --allowed-origins. The server also exposes browser_run_code_unsafe, which runs arbitrary Playwright code on this PC, and nothing here removes it. Needs port 4817 free. Edge must be installed.

## Variant: `scenarios`, multi-step scenario tasks

- Both paths expose the same 24 tools of the pinned `@playwright/mcp@0.0.86`.

Reproduce: `npm run bench -- --service playwright --variant scenarios --runs 3`.

### Model: `claude-sonnet-5-5`

#### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| catalog-sum | 3/3 / 3/3 | 31,356 | 11,844 | **-62%** | 12.5s | 12.5s | **0%** | $0.028 | $0.029 |
| form | 3/3 / 3/3 | 30,308 | 7,433 | **-75%** | 11.3s | 11.7s | **3%** | $0.022 | $0.013 |
| top-rated | 3/3 / 3/3 | 29,567 | 9,260 | **-69%** | 12.1s | 17.2s | **43%** | $0.031 | $0.022 |

Token change ranges from **-75%** (form) to **-62%** (catalog-sum).

#### Task: catalog-sum

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.7 | 2.7 | 7,608 | 527 | 1,838 | 28,992 | 31,356 | $0.028 | 12.5s |
| codemode | 3/3 | 3.3 | 2.3 | 1,597 | 477 | 3,308 | 8,060 | 11,844 | $0.029 | 12.5s |

#### Task: form

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 5.0 | 4.0 | 7,603 | 409 | 1,193 | 28,706 | 30,308 | $0.022 | 11.3s |
| codemode | 3/3 | 3.3 | 2.3 | 1,592 | 465 | 652 | 6,317 | 7,433 | $0.013 | 11.7s |

#### Task: top-rated

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.3 | 2.3 | 7,604 | 378 | 2,988 | 26,202 | 29,567 | $0.031 | 12.1s |
| codemode | 3/3 | 3.7 | 2.7 | 1,593 | 599 | 1,801 | 6,860 | 9,260 | $0.022 | 17.2s |

#### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 4.0 | 3.0 | 7,605 | 438 | 2,006 | 27,967 | 30,411 | $0.027 | 12.0s |
| codemode | 9/9 | 3.4 | 2.4 | 1,594 | 514 | 1,920 | 7,079 | 9,512 | $0.021 | 13.8s |

Total tokens, codemode vs direct: **-69%** (9,512 vs 30,411).

Wall time, codemode vs direct: **16%** (13.8s vs 12.0s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Variant: `calls`, one tool call per task

- Each task asks for exactly one upstream tool call (3 of 16 cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.
- Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.
- Both paths expose the same 24 tools of the pinned `@playwright/mcp@0.0.86`.

Reproduce: `npm run bench -- --service playwright --variant calls --runs 3`.

### Model: `claude-sonnet-5-5`

#### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| browser_navigate | 3/3 / 3/3 | 23,611 | 3,591 | **-85%** | 8.4s | 8.8s | **5%** | $0.012 | $0.006 |
| browser_snapshot | 3/3 / 3/3 | 15,929 | 3,713 | **-77%** | 8.0s | 8.5s | **6%** | $0.011 | $0.006 |
| browser_evaluate | 3/3 / 3/3 | 23,519 | 3,480 | **-85%** | 9.6s | 8.5s | **-12%** | $0.012 | $0.004 |

Token change ranges from **-85%** (browser_evaluate) to **-77%** (browser_snapshot).

#### Task: browser_navigate

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,561 | 131 | 601 | 22,879 | 23,611 | $0.012 | 8.4s |
| codemode | 3/3 | 2.0 | 1.0 | 1,550 | 176 | 411 | 3,005 | 3,591 | $0.006 | 8.8s |

#### Task: browser_snapshot

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,570 | 166 | 649 | 15,114 | 15,929 | $0.011 | 8.0s |
| codemode | 3/3 | 2.0 | 1.0 | 1,559 | 161 | 496 | 3,055 | 3,713 | $0.006 | 8.5s |

#### Task: browser_evaluate

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,574 | 152 | 453 | 22,914 | 23,519 | $0.012 | 9.6s |
| codemode | 3/3 | 2.0 | 1.0 | 1,563 | 138 | 202 | 3,140 | 3,480 | $0.004 | 8.5s |

#### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 3.0 | 2.0 | 7,568 | 150 | 568 | 20,302 | 21,020 | $0.012 | 8.7s |
| codemode | 9/9 | 2.0 | 1.0 | 1,557 | 158 | 370 | 3,067 | 3,594 | $0.006 | 8.6s |

Total tokens, codemode vs direct: **-83%** (3,594 vs 21,020).

Wall time, codemode vs direct: **-1%** (8.6s vs 8.7s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Per-tool-call benchmark (no model)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../README.md](../README.md).

Generated 2026-11-22. 25 upstream tools, 16 cases over 16 tools, 8 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service playwright --iters 8`.

### Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| browser_take_screenshot | 410 | 21 | 358 | yes |
| browser_find | 308 | 14 | 275 | yes |
| browser_emulate_media | 271 | 22 | 200 | no |
| browser_fill_form | 264 | 7 | 188 | no |
| browser_network_requests | 244 | 16 | 206 | yes |
| browser_drop | 240 | 12 | 179 | no |
| browser_network_request | 219 | 13 | 178 | no |
| browser_tabs | 215 | 14 | 174 | yes |
| browser_click | 214 | 18 | 162 | yes |
| browser_snapshot | 210 | 14 | 179 | yes |
| browser_type | 210 | 15 | 165 | yes |
| browser_run_code_unsafe | 207 | 11 | 187 | no |
| browser_evaluate | 205 | 15 | 168 | yes |
| browser_drag | 204 | 17 | 161 | no |
| browser_console_messages | 203 | 13 | 168 | yes |
| browser_select_option | 166 | 13 | 127 | yes |
| browser_wait_for | 162 | 11 | 134 | yes |
| browser_hover | 121 | 9 | 91 | yes |
| browser_file_upload | 99 | 8 | 76 | no |
| browser_handle_dialog | 98 | 12 | 72 | no |
| browser_resize | 93 | 8 | 62 | yes |
| browser_press_key | 86 | 7 | 63 | yes |
| browser_navigate | 69 | 6 | 46 | yes |
| browser_navigate_back | 57 | 7 | 44 | yes |
| browser_close | 53 | 5 | 37 | no |
| **Total sent every turn** | **4,626** | **531** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 410 tokens, 9% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **1,709 characters** (fits), listing every function at detail level 2 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../README.md).

### Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| browser_navigate | 53 | 61 | 54 | 59 | +0.9 ms | 232 | 240 | 0/0 |
| browser_snapshot | 5.5 | 7.4 | 7.1 | 8.3 | +1.7 ms | 574 | 582 | 0/0 |
| browser_find | 4.9 | 6.0 | 6.9 | 8.7 | +2.0 ms | 284 | 292 | 0/0 |
| browser_evaluate | 512 | 514 | 512 | 521 | -0.3 ms | 104 | 112 | 0/0 |
| browser_click | 532 | 537 | 538 | 543 | +6.6 ms | 219 | 227 | 0/0 |
| browser_type | 10 | 12 | 12 | 14 | +1.7 ms | 74 | 82 | 0/0 |
| browser_select_option | 12 | 14 | 15 | 15 | +2.1 ms | 234 | 242 | 0/0 |
| browser_hover | 20 | 22 | 21 | 22 | +1.3 ms | 219 | 227 | 0/0 |
| browser_press_key | 6.1 | 7.9 | 7.4 | 8.6 | +1.2 ms | 80 | 88 | 0/0 |
| browser_take_screenshot | 26 | 31 | 27 | 47 | +0.6 ms | 14,286 | 14,428 | 0/0 |
| browser_console_messages | 3.7 | 3.9 | 4.9 | 5.3 | +1.2 ms | 54 | 62 | 0/0 |
| browser_network_requests | 2.4 | 3.3 | 3.7 | 4.6 | +1.3 ms | 81 | 89 | 0/0 |
| browser_tabs | 4.5 | 4.8 | 6.2 | 6.4 | +1.8 ms | 68 | 76 | 0/0 |
| browser_resize | 2.6 | 3.9 | 3.8 | 4.9 | +1.2 ms | 91 | 99 | 0/0 |
| browser_wait_for | 119 | 127 | 116 | 121 | -2.7 ms | 270 | 278 | 0/0 |
| browser_navigate_back | 40 | 45 | 41 | 51 | +0.9 ms | 164 | 172 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 0.7 ms, p95 1.1 ms. This is the floor of codemode's per-call overhead.

### Coverage

Cases cover 16 of 25 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| browser_close | Closes the browser; every later case would have nothing to talk to. |
| browser_handle_dialog | Needs a JavaScript dialog to be open. |
| browser_emulate_media | Changes browser-wide rendering state that would carry into later cases. |
| browser_file_upload | Needs a file chooser to be open and a file on disk. |
| browser_drop | Needs a drop target and files or data. |
| browser_fill_form | Takes a structured array of fields; covered by the form task instead. |
| browser_network_request | Needs an index from a prior network listing. |
| browser_run_code_unsafe | Runs arbitrary Playwright code on this PC; deliberately not exercised. |
| browser_drag | Needs two live element references. |

### Cases

| Case | Arguments | Model prompt |
|---|---|---|
| browser_navigate | `{"url":"http://127.0.0.1:4817/form"}` | yes |
| browser_snapshot | `{}` | yes |
| browser_find | `{"text":"Email"}` | latency only |
| browser_evaluate | `{"function":"() => document.title"}` | yes |
| browser_click | `{"target":"#inc"}` | latency only |
| browser_type | `{"target":"#name","text":"Ada"}` | latency only |
| browser_select_option | `{"target":"#plan","values":["Pro"]}` | latency only |
| browser_hover | `{"target":"#inc"}` | latency only |
| browser_press_key | `{"key":"Tab"}` | latency only |
| browser_take_screenshot | `{"scale":"css"}` | latency only |
| browser_console_messages | `{"level":"info"}` | latency only |
| browser_network_requests | `{"static":false}` | latency only |
| browser_tabs | `{"action":"list"}` | latency only |
| browser_resize | `{"width":1000,"height":700}` | latency only |
| browser_wait_for | `{"time":0.1}` | latency only |
| browser_navigate_back | `{}` | latency only |

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `scenarios`

- **catalog-sum**: Open http://127.0.0.1:4817/catalog in the browser. It lists 150 products with category, price and stock. What is the total price, in dollars, of all in-stock products in the category 'Tools'? Reply with one short sentence that contains the amount.
- **form**: Open http://127.0.0.1:4817/form. Fill in the name Ada Lovelace, the email ada@example.com, choose the plan Pro, tick the agreement checkbox, and submit the form. Reply with one short sentence.
- **top-rated**: The site at http://127.0.0.1:4817/list?page=1 shows rated items across 6 pages, with a "Next page" link on each. Go through all the pages, find the item with the highest rating, and reply with one short sentence that gives its id.

### `calls`

- **browser_navigate** (pre-seeded): Open http://127.0.0.1:4817/form in the browser and tell me the page heading in one short sentence.
- **browser_snapshot** (pre-seeded): Open http://127.0.0.1:4817/form, take a snapshot of the page, and list the labels of its form fields in one short sentence.
- **browser_evaluate** (pre-seeded): Open http://127.0.0.1:4817/counter and evaluate JavaScript in the page to read document.title, then tell me exactly what it returned.
