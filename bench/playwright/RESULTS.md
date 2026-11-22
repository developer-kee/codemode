# Benchmark: Playwright (browser, local test site), direct MCP vs codemode

- Both paths launch the same pinned `@playwright/mcp@0.0.86` (headless Edge, isolated profile, restricted to the local fixture origin) and see the same 24 tools; the browser starts fresh for every run.
- Tasks run against a deterministic local website (150-row catalog, a form, a 6-page ratings list), so results do not depend on the internet.
- Pass/fail comes from the fixture itself: the form task checks what the server received; the other tasks check the answer against values computed from the fixture data.
- Unlike Blender and Windows, these tasks return large page snapshots (the catalog is one big table), so they exercise filtering big tool results in code, which is the case Code Mode is designed for.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `calls`. Method, metric definitions and limitations: [../README.md](../README.md).

> **Warning:** Drives a real headless Microsoft Edge (already installed; nothing is downloaded) against a small local site on http://127.0.0.1:4817, and the browser is limited to that origin with --allowed-origins. The server also exposes browser_run_code_unsafe, which runs arbitrary Playwright code on this PC, and nothing here removes it. Needs port 4817 free. Edge must be installed.

_No runs recorded yet._

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
