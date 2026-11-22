# Benchmark: Notion (official MCP server), direct MCP vs codemode

- Pass/fail comes from values computed from the seed data, or from reading the created page back through the Notion REST API, not from the model's claim.
- The seeded database is created once per benchmark run, so write tasks are reset by trashing the page they create.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** WRITES to a real Notion workspace. Needs NOTION_TOKEN (an internal integration token) and NOTION_BENCH_PAGE_ID (a page shared with that integration). It creates a "codemode bench <timestamp>" page with a 40-row database under that page (about 15 s), trashes older "codemode bench" pages there, and lets the model create a "Summary" page. It touches nothing outside that page. Use a test workspace. UNTESTED against live Notion: the seeding code follows the API documentation but has never run.

_No runs recorded yet._

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `scenarios`

- **status-count** (pre-seeded): The Notion workspace has a database titled "Bench Tasks" on a page whose title starts with "codemode bench". Each task has a Name, a Status (Todo, Doing or Done), a Priority number and an Owner. How many tasks have the Status Done, and what is the highest Priority among the tasks whose Status is Doing? Reply with one short sentence.
- **owner-load** (pre-seeded): The Notion workspace has a database titled "Bench Tasks" on a page whose title starts with "codemode bench". Each task has a Name, a Status (Todo, Doing or Done), a Priority number and an Owner. Which Owner has the most tasks that are not yet Done, and how many open tasks do they have? Reply with one short sentence.
- **write-summary** (pre-seeded): The Notion workspace has a database titled "Bench Tasks" on a page whose title starts with "codemode bench". Each task has a Name, a Status (Todo, Doing or Done), a Priority number and an Owner. Create a new page titled "Summary" directly under the page whose title starts with "codemode bench". Put three paragraphs on it, one per Status, in the form "Todo: N", "Doing: N" and "Done: N", where N is the number of tasks with that Status. Reply with one short sentence.

### `calls`

- **API-post-search** (pre-seeded): Search Notion for the database titled "Bench Tasks" and tell me its title in one short sentence.
- **API-query-data-source** (pre-seeded): How many tasks are in the Notion database titled "Bench Tasks"? Reply with one short sentence.
- **API-get-block-children** (pre-seeded): List what is on the Notion page whose title starts with "codemode bench" and name the database you find there in one short sentence.
