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
| catalog-sum | 1/1 / 0/1 | 34,125 | 39,728 | **16%** | 12.5s | 24.8s | **98%** | $0.070 | $0.072 |
| form | 1/1 / 0/1 | 25,100 | 31,243 | **24%** | 11.1s | 23.5s | **112%** | $0.023 | $0.043 |

Token change ranges from **16%** (catalog-sum) to **24%** (form).

#### Task: catalog-sum

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 4.0 | 3.0 | 7,608 | 461 | 9,329 | 24,335 | 34,125 | $0.070 | 12.5s |
| codemode | 0/1 | 9.0 | 8.0 | 1,597 | 1,733 | 6,081 | 31,914 | 39,728 | $0.072 | 24.8s |

#### Task: form

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 5.0 | 4.0 | 7,603 | 407 | 1,583 | 23,110 | 25,100 | $0.023 | 11.1s |
| codemode | 0/1 | 10.0 | 9.0 | 1,592 | 1,225 | 2,726 | 27,292 | 31,243 | $0.043 | 23.5s |

#### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 2/2 | 4.5 | 3.5 | 7,606 | 434 | 5,456 | 23,723 | 29,613 | $0.046 | 11.8s |
| codemode | 0/2 | 9.5 | 8.5 | 1,595 | 1,479 | 4,404 | 29,603 | 35,486 | $0.057 | 24.2s |

Total tokens, codemode vs direct: **20%** (35,486 vs 29,613).

Wall time, codemode vs direct: **105%** (24.2s vs 11.8s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

#### Failed runs

| Task | Path | Repeat | Reason |
|---|---|---|---|
| catalog-sum | codemode | 1 | answer lacks 1355.75: I couldn't get the total. The browser tool began failing with "memory access out of bounds" errors |
| form | codemode | 1 | no submission recorded |

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
