# Benchmarks

Each service wrapped by codemode is benchmarked **separately**. For every service, the same model does the same tasks twice: once with the upstream MCP server used directly, once with the same server behind codemode (`execute_code` over a typed `codemode.*` API, plus `get_api`). The harness measures **tokens, cost, turns and wall time**, and checks the result objectively.

| Service | Folder | Results |
|---|---|---|
| Blender | [suites/blender/](suites/blender/) | [suites/blender/RESULTS.md](suites/blender/RESULTS.md) |
| Windows ([Windows-MCP](https://github.com/CursorTouch/Windows-MCP)) | [suites/windows/](suites/windows/) | [suites/windows/RESULTS.md](suites/windows/RESULTS.md) |
| Playwright ([@playwright/mcp](https://github.com/microsoft/playwright-mcp), local test site) | [suites/playwright/](suites/playwright/) | [suites/playwright/RESULTS.md](suites/playwright/RESULTS.md) |
| Filesystem (reference [MCP server](https://github.com/modelcontextprotocol/servers)) | [suites/filesystem/](suites/filesystem/) | [suites/filesystem/RESULTS.md](suites/filesystem/RESULTS.md) |
| Calendar ([dav-mcp](https://www.npmjs.com/package/dav-mcp) over a local CalDAV server) | [suites/calendar/](suites/calendar/) | [suites/calendar/RESULTS.md](suites/calendar/RESULTS.md) |
| Notion ([official MCP server](https://github.com/makenotion/notion-mcp-server)) | [suites/notion/](suites/notion/) | [suites/notion/RESULTS.md](suites/notion/RESULTS.md) (no runs yet) |

[RESULTS.md](RESULTS.md) is the overview: a model comparison matrix, then one row per service, variant and model. All `RESULTS.md` files are generated from the raw runs; do not edit them by hand.

> **Read the warning for a service before running its benchmark.** Blender runs wipe the open scene. Windows runs give the model real PowerShell and file access on your PC (the `scenarios` variant exposes every Windows-MCP tool, including screenshots and input). Playwright drives a headless browser limited to a local test site. Filesystem is confined to a sandbox folder; Calendar starts a throwaway local Radicale server and never touches a real calendar; Notion **writes to a real workspace** and needs your integration token. The warning is printed when a run starts and is repeated at the top of each service's `RESULTS.md`.

## Layout

Three layers: entrypoints (`cli/`), the reusable harness (`lib/`), and one folder per suite (`suites/<id>/`), matching `services/<id>.ts` at the repo root.

```
bench/
  README.md
  RESULTS.md            generated overview
  registry.ts           the list of benchmarked services
  cli/
    run.ts              npm run bench -- --service <id> ...   (model-driven runs)
    calls.ts            npm run bench:calls                    (deterministic per-call benchmark)
    report.ts           npm run bench:report                   (rebuild every RESULTS.md)
    validate.ts         npm run bench:validate                 (offline consistency check)
  lib/
    types/              BenchService, BenchVariant, Task, CallDef, ... (index.ts re-exports)
    runners/            AgentRunner and the runners: agent.ts, mcp.ts, claude.ts, dsh.ts, index.ts
    calls/              static cost, latency, connections, the `calls` variant, report sections
    report/             run records, model families, markdown summaries
  suites/<id>/
    index.ts            BenchService: warning, notes, preflight, and its named variants
    tasks.ts            scenario tasks, each with its own setup and objective check
    cases.ts            per-tool-call cases (data only)
    (extras)            e.g. blender/socket.ts, playwright/fixture.ts
    results/            raw runs, one JSON line per run, all variants together (`variant` field on each record)
    calls-latest.json   output of `bench:calls`: static definition costs, latency, coverage
    RESULTS.md          generated report for this service
  legacy/migrate.ts     one-off migration from the earlier layout
  work/                 scratch configs for a run (git-ignored)
```

## Variants

A service offers named variants of the benchmark; every run record carries its `variant`, and `--variant` selects one (default `scenarios`). `npm run bench -- --list` shows what each service has.

| Variant | What it runs |
|---|---|
| `scenarios` | The multi-step scenario tasks (Blender: table, grid, inspect-modify, audit; Windows: files, inventory, organize; Playwright: catalog-sum, form, top-rated; Filesystem: notes-index, log-triage, organize, retries; Calendar: busiest-day, standup-hours, free-slot, create-events; Notion: status-count, owner-load, write-summary). Both paths expose every upstream tool. |
| `scenarios-4-tools` | Windows only: the original benchmark that whitelisted `FileSystem,PowerShell,Process,Wait` on both paths (no screen or input tools). Understates the schema overhead of a full install. |
| `calls` | One model-driven task per upstream tool call, generated from `cases.ts`: a prompt that makes the model call that one tool, checked against the answer or the resulting state. No single tool can dominate the totals. |

Records without a `variant` field (written before variants existed) are read as `scenarios`.

## What is compared

| | `direct` | `codemode` |
|---|---|---|
| MCP server | the upstream, launched as a user would (`uvx ...`) | `node src/cli.ts <service>` (wraps the same upstream) |
| Tools the model sees | every upstream tool in the benchmark set | 2 tools: `execute_code` and `get_api` |
| Model | same | same |
| Prompt, system prompt | same | same |
| Claude Code built-in tools | disabled | disabled |

Everything else is held equal: same machine and target application, same upstream behaviour (including its telemetry), same task text, same budget cap.

## Models

The benchmark is **model- and harness-agnostic**: a *runner* drives a model with the same MCP server, prompts and checks, and every record stores the model id and the runner id. Reports lead with a **Models** table and a **Compare models** matrix — one column per model, cells showing token change, codemode/direct totals and pass counts — then the detailed per-family tables. Adding a model adds a column automatically; untouched service/variant pairs read `not run`.

| Family | Model | Runner | What runs |
|---|---|---|---|
| Claude | `claude-sonnet-5-5` | `claude` | Claude Code headless (`claude -p`), built-in tools off |
| DeepSeek | `deepseek-flash` | `dsh` | DeepSeek Harness headless (`dsh headless --json`), built-in tools off |

The runner is chosen from the model id: `claude*` → `claude`, `deepseek*` → `dsh`; any other model needs `--runner <id>`. Adding a family or a model requires no report changes.

Each harness sends its own system prompt and tool guidance, so token counts are comparable **within** a runner, and a cross-runner difference includes the harness as well as the model. `bench:validate` warns if one model was recorded through more than one runner.

## Runners

- **`claude`** — [lib/runners/claude.ts](lib/runners/claude.ts). Spawns `claude -p --output-format stream-json`, reads usage, cost and turns from its result event. Reports spend, so its cost columns are filled.
- **`dsh`** — [lib/runners/dsh.ts](lib/runners/dsh.ts). Spawns `dsh headless --json`, parses its run events, and builds a temporary `--patch` overlay per run: the configured DSH provider (`DSH_BENCH_PROVIDER`, default `deepseek-account`), `--model`, reasoning effort `DSH_BENCH_REASONING` (default `high`), the service system prompt, every built-in tool disabled, and one MCP server. It does not report spend, so its cost columns are `n/a`. The launcher is found from `DSH_BIN`, from the running Desktop install, or on `PATH`.

To add a runner, create an `AgentRunner` ([lib/runners/agent.ts](lib/runners/agent.ts)): launch the path's MCP server with [`mcpLaunch()`](lib/runners/mcp.ts) so both paths see the same tools, send the task and the service's system prompt with built-in tools off, and return an `AgentRun` (`turns`, `toolCalls`, `toolNames`, `firstTurnContext`, `usage`, optional `costUsd`, `durationMs`). Register it in [lib/runners/index.ts](lib/runners/index.ts) and it appears in `--list`, in records and in the reports.

## Method

For each repeat, task and path (path order alternates between repeats so cache warm-up and machine drift don't favour one side):

1. **Prepare**: the task resets the tool's world to a known state and seeds it if needed (Blender: empty and seed the scene over the addon socket; Windows: recreate a sandbox folder with seeded files).
2. **Run** the runner — Claude Code headless (`claude -p --output-format stream-json --verbose`) or DSH headless (`dsh headless --json`) — with only that path's MCP server, built-in tools off, no skills or user/project settings, no session persistence, a fixed one-line system prompt per service, and a per-run spend cap where the runner supports one (`--max-budget-usd`, default $2). The working directory is an empty folder (`bench/work/`, git-ignored) so no `CLAUDE.md`/`AGENTS.md` is picked up.
3. **Verify**: the task inspects the real result (a Blender scene snapshot, or files on disk) with a check written in code. A run passes only if the state is right and, where asked, the model's one-line answer contains the correct number. The model's own claim of success is never used.
4. **Record** one JSON line in `bench/suites/<service>/results/<batch>.jsonl`; `cli/report.ts` aggregates all batches into `RESULTS.md`.

### Metrics

All token counts come from the usage reported by the runner for the whole run: Claude Code's result event, or the sum of DSH's per-step usage events.

| Column | Meaning |
|---|---|
| Pass | Runs that passed the objective check / runs attempted |
| Turns, Tool calls | Model round trips and MCP calls |
| First-turn context | Input size of the first request: system prompt + tool definitions + task. Isolates the fixed cost of the tool schemas |
| Output | Output tokens |
| Fresh input | `input_tokens` + cache-creation tokens |
| Cache read | Tokens served from prompt cache (cheaper per token, but they grow with every turn) |
| Total tokens | Fresh input + cache read + output |
| Cost | `total_cost_usd` as reported by Claude Code; `n/a` for runners that do not report spend (DSH) |
| Wall time | Whole headless run, including MCP server start-up, per-turn model latency and the tool's own execution |

`apiMs` (time waiting on the model API) is recorded for runs made after it was added; older records lack it and the report does not use it.

## Services and tasks

The exact prompts are repeated at the bottom of each service's `RESULTS.md`. Prompts never name tools, so each path chooses its own.

### Blender

Needs Blender open with the [BlenderMCP addon](https://github.com/ahujasid/blender-mcp) connected on `localhost:9876` (a copy is in `vendor/addon.py`). Every run **wipes the open scene**. The check uses the world-space bounding-box centre of each object rather than its origin, so correct geometry built with the origin elsewhere is not marked wrong (an early version used the origin and wrongly failed correct tables on both paths; fixed before any published numbers).

| Task | What it tests |
|---|---|
| `table` | Build a specified table (top + four legs) from an empty scene; exact sizes and positions |
| `grid` | 5 x 5 grid of cubes with per-row materials: many similar objects |
| `inspect-modify` | Pre-seeded scene (8 crates, 4 barrels): find objects by name, edit two groups differently, report how many changed |
| `audit` | 40 pre-seeded objects in five groups with known off-grid and below-ground cases: count, snap to a grid, fix heights conditionally, report how many needed fixing |

### Windows

Uses [Windows-MCP](https://github.com/CursorTouch/Windows-MCP) (`uvx windows-mcp serve`). The `scenarios` variant exposes **all 20 tools** on both paths, including screenshots and mouse and keyboard input; the prompts only need files and say to stay inside the sandbox, but nothing stops the model using the others. The `scenarios-4-tools` variant whitelists four **non-visual** tools, `FileSystem,PowerShell,Process,Wait`, so no run can capture the screen or send input to the desktop. All tasks work inside one sandbox folder (`%TEMP%\codemode-bench-windows`) that is deleted and recreated before every run. The model still has real PowerShell, so it could in principle act outside that folder; run this only on a machine where that is acceptable.

| Task | What it tests |
|---|---|
| `files` | Create a folder tree and four files with exact contents, plus an index file |
| `inventory` | 30 seeded files: filter by extension, sort by size with tie-breaks, write a CSV, report a computed total |
| `organize` | 40 loose seeded files: move each into a folder named after its upper-cased extension, nothing lost or renamed, report the count |

### Playwright

Uses [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) pinned to 0.0.86 (`npx`), driving headless Microsoft Edge in an isolated profile against a small deterministic site served by the harness on `http://127.0.0.1:4817` (`playwright/fixture.ts`). The browser is restricted to that origin with `--allowed-origins`; the server also offers `browser_run_code_unsafe`, which nothing here removes. Needs Edge installed and port 4817 free. Unlike the other two, these tasks return large page snapshots, so they exercise filtering big tool results in code.

| Task | What it tests |
|---|---|
| `catalog-sum` | A 150-row product table: total price of the in-stock products in one category |
| `form` | Fill and submit a form (text, email, select, checkbox); the check is what the fixture server received |
| `top-rated` | A rated list over 6 pages with a "Next page" link: find the one item rated 5.0 (the fixture guarantees it is unique) |

### Filesystem

Uses the reference server `@modelcontextprotocol/server-filesystem@2.4.0` (`npx`, 16 tools). The sandbox is `bench/work/fs-sandbox`, wiped before every run. It sits **inside the benchmark's working directory on purpose**: Claude Code tells MCP servers its working directory as a "root", and this server then uses that root instead of the directories on its command line, so a sandbox anywhere else would be reachable by the codemode path (which sends no roots) but not by the direct path. As a result the direct path can reach all of `bench/work/`, the codemode path only the sandbox.

| Task | What it tests |
|---|---|
| `notes-index` | Create a folder tree with exact file contents and an index file |
| `log-triage` | 20 log files of 60 lines: count ERROR and WARN lines per file, write a sorted CSV, name the worst file. Built to favour code mode: a tool-by-tool model must pull every file into context |
| `organize` | 40 loose files moved into folders by extension: many small calls for the direct path |
| `retries` | A nested tree of `.cfg` files: change `retries=3` to `retries=5` in the matching ones only and count them |

### Calendar

Uses [`dav-mcp@5.1.2`](https://www.npmjs.com/package/dav-mcp) (27 tools: calendar, contacts and tasks) against a throwaway [Radicale](https://radicale.org) CalDAV server that the benchmark starts with `uvx` on `127.0.0.1:5233` (`calendar/fixture.ts`; data under `bench/work/radicale/`). It seeds one calendar, "Work", with about 60 December 2026 events, and runs with `TZ=UTC` so times mean the same on both paths. The benchmark refuses to start if port 5233 is already in use. Nothing touches a real calendar.

| Task | What it tests |
|---|---|
| `busiest-day` | Count events per day over a month and name the busiest day and its count |
| `standup-hours` | Sum the lengths of every event with a given title |
| `free-slot` | Find the earliest free one-hour gap in a day with back-to-back events |
| `create-events` | Create three events; the check reads them back from the CalDAV server |

In these runs the codemode path called `get_api` first on every task and needed extra scripts on the two counting tasks, so its wall time is 27-56% longer even though its tokens are 64-79% lower. The compact index in the `execute_code` description lists parameter names only, so the model asks for full types; this is a real cost of that design, not noise.

### Notion

Uses the official `@notionhq/notion-mcp-server@2.6.1` (`npx`, 23 tools with about 76,000 characters of definitions, the largest catalogue here). **It writes to a real workspace.** Set `NOTION_TOKEN` (an internal integration token) and `NOTION_BENCH_PAGE_ID` (a page shared with that integration) in your shell; the config refers to the token as `${NOTION_TOKEN}`, which Claude Code and the per-call benchmark expand, so it is never written to a file. The benchmark creates one `codemode bench <timestamp>` page with a 40-row database under that page (about 15 s), trashes older bench pages there, and lets the model create a `Summary` page.

| Task | What it tests |
|---|---|
| `status-count` | Count rows by status and find the highest priority among the "Doing" rows |
| `owner-load` | Group open tasks by owner and name the busiest one |
| `write-summary` | Create a page with one paragraph per status; the check reads it back through the REST API |

> **Not yet run.** The seeding code follows the Notion API documentation (version 2025-09-03, data sources) but has only been type-checked; expect to adjust request shapes on the first real run. Runners other than Claude Code may not expand `${NOTION_TOKEN}`.
## Run it

Prerequisites: Node 24+ with `npm install` done in the repo root; `uvx` available; a logged-in runner — Claude Code (`claude auth login`; the desktop app's login is separate) or an API key in the environment for Claude, and for DSH a signed-in DeepSeek Harness install; plus each service's own prerequisites above.

> Runs spend your usage. The Blender `scenarios` batch (24 runs) cost under $1 in total at Sonnet prices; DSH account runs report tokens but not spend.

```powershell
npm run bench -- --list                                       # services, variants, runners and their tasks
npm run bench -- --service blender --runs 3                   # default variant (scenarios), both paths
npm run bench -- --service windows --variant scenarios-4-tools --runs 3
npm run bench -- --service playwright --variant calls --runs 1   # one model-driven task per tool call
npm run bench -- --service playwright --model deepseek-flash --runs 3   # DSH runner, chosen from the model id
npm run bench -- --service blender --runs 1 --tasks table,grid
npm run bench -- --service windows --model claude-opus-5-5 --runs 3
npm run bench -- --service playwright --model my-model --runner my-runner --runs 3
npm run bench:calls -- --service blender --iters 10           # no model: definition cost + latency -> blender/calls-latest.json
npm run bench:report                                          # rebuild every RESULTS.md from results/*.jsonl and calls-latest.json
npm run bench:validate                                        # offline: definitions, raw runs, per-call data, report freshness
```

Options of `bench`: `--service`, `--variant` (default `scenarios`), `--runs`, `--model`, `--runner` (default `auto`, from the model id), `--tasks`, `--paths direct,codemode`, `--budget` (USD per run, Claude Code only), `--timeout` (seconds per run). `bench:calls` takes `--service` and `--iters`; it connects to the service's default variant (all tools) and needs the same prerequisites. `bench:validate` starts nothing and calls no model, so it is free and safe to run after every change; it fails on unknown variants, tasks or runners, malformed usage numbers, an over-cap `execute_code` description, inconsistent `calls-latest.json`, or a `RESULTS.md` that no longer matches the raw data, and warns on a non-MCP tool call (built-in tools not fully off) or one model recorded through two runners.

Reports group by variant, then by model family, then by model, so runs with different models sit side by side. Batches accumulate; delete a `results/*.jsonl` file to drop that batch (it stays in git history).

## Add a task to a service

Add an entry in `<service>/tasks.ts` (Blender: a spec with `seed`, `prompt`, `verify`; Windows and Playwright: a `Task` with `prepare` and `verify`):

```ts
{
  id: 'my-task',
  prompt: 'Plain-language instructions. Do not mention tool names.',
  seeded: false,
  async prepare() { /* reset the world, seed it */ },
  async verify(answer) { /* inspect the real result; return { pass, detail } */ },
}
```

Keep tasks deterministic: fixed seed data, no network or asset-library dependence, tolerances on numeric checks. Run `npx tsc` and `npm run bench:validate` after the change.

To add a per-tool-call case, add an entry in `bench/suites/<id>/cases.ts`: `tool` and `args` give the deterministic latency measurement, `before` any setup calls, and `prompt` plus `expect` (or `check`) make it a task of the `calls` variant. Every upstream tool must either have a case or be listed in `skipped` with the reason.

## Add a service

1. Add the service to `services/<id>.ts` (see the main README).
2. Create `bench/suites/<id>/` with
   - `tasks.ts`: the scenario tasks;
   - `cases.ts`: a `CallDef` (`cases`, `skipped`, `reset`), data only;
   - `index.ts`: a `BenchService` ([lib/types/](lib/types/)) with the `warning`, `notes`, `preflight`, and its `variants`. Each variant gives the direct upstream command, an env for the codemode wrapper so both paths expose the same tools, a system prompt, `notes` and `tasks`. Define the `scenarios` variant, then add `callsVariant(scenarios, cases)` ([lib/calls/variant.ts](lib/calls/variant.ts)) to get the `calls` variant. Add more variants (like Windows' `scenarios-4-tools`) when the same tasks should run against a different tool set.
3. Register it in [registry.ts](registry.ts). `npm run bench -- --list` should show it, and `npm run bench:validate` should pass for the new definitions.

Prefer tasks that are safe to repeat and fully checkable from outside the model. Think about side effects first and say them in `warning`.

## Raw data format

`bench/suites/<service>/results/<batch>.jsonl`, one object per run, all variants of the service together:

```
{ batch, variant, task, model, runner, repeat, pass, verdict,
  run: { path, ok, error?, answer, turns, toolCalls, toolNames[], availableTools[],
         firstTurnContext, usage: { input, cacheWrite, cacheRead, output },
         costUsd?, durationMs, apiMs? } }
```

`variant` is the variant id (`scenarios`, `scenarios-4-tools`, `calls`); a record without it counts as `scenarios`. `runner` is the runner id; records written before runners existed have none and count as `claude`. `costUsd` is omitted when the runner does not report spend (DSH). `availableTools` is recorded at start-up when the runner exposes it, to prove built-in tools were off and only the intended MCP tools were visible; DSH does not report it.

## Limitations (read before quoting numbers)

- **Small sample.** Typically 3 runs per task and path, one machine, one day. Wall-time differences of a few percent are noise.
- **Two models, two harnesses.** `claude-sonnet-5-5` runs through Claude Code and `deepseek-flash` through DSH, so a Claude-vs-DeepSeek difference includes the harness. Compare codemode-vs-direct **within** a family; the direct/codemode split is measured under the same runner in both cases. Other models are supported but not yet recorded.
- **Services are not comparable with each other.** Task difficulty, the number of upstream tools and the benchmark's tool whitelist differ per service.
- **The saving is mostly tool-definition overhead.** Direct sends every upstream tool schema each turn; codemode sends one compact index. Where the model uses only one upstream tool anyway (Blender: run Python), the benchmark does not exercise **chaining several different upstream tools in one script**, which is where codemode is meant to help most.
- **`scenarios-4-tools` understates the schema overhead.** The real Windows-MCP server offers 20 tools; that variant exposes four. The `scenarios` variant exposes all 20.
- **The description budget is now guarded, not silently truncated.** Claude Code cuts MCP tool descriptions at about 2,048 characters, and the first design put the whole typed API in the `execute_code` description, so the model never saw the function list. Since the compact index landed, the description fits: `bench:calls` records its exact length and flags an overflow (Playwright: 1,709 characters for 25 tools), and `bench:validate` fails if a recorded description exceeds the cap. Runs made before the fix (in git history, no longer in the tree) had savings that were **upper bounds**; current results are not. See [../docs/landscape.md](../docs/landscape.md).
- **Prompt cache.** Cache-read tokens depend on caching behaviour and vary between runs; that is why `Fresh input`, `Cache read` and `Total` are shown separately.
- **Telemetry.** The upstream servers send their own telemetry on both paths. It was left on to keep the paths identical.
- **Task difficulty.** All tasks are doable with one script. Harder or more tool-diverse tasks may change the picture, in either direction.

## Tested with

| | |
|---|---|
| Date | 2026-11-22 |
| Models | `claude-sonnet-5-5` via Claude Code 2.1.229; `deepseek-flash` via DeepSeek Harness 0.2.2-rc.5 (reasoning effort `high`) |
| Blender | 5.3.0, BlenderMCP addon 2.0 (protocol 16) |
| `blender-mcp` (upstream, via uvx) | 2.0.0 |
| `windows-mcp` (upstream, via uvx) | 0.8.5 |
| `@playwright/mcp` (upstream, via npx) | 0.0.86 (Microsoft Edge, headless) |
| Node | 24.14.0 |
| `@modelcontextprotocol/sdk` | 1.32.2 |
| `quickjs-emscripten` | 0.32.0 |
| OS | Windows 11 |

## Moving from the old layout

Before the one-folder-per-service layout, each variant had its own folder (`blender-calls`, `windows-full`, `windows-calls`, and `windows` meaning the 4-tool run). `node bench/legacy/migrate.ts` moves those results into the service folders and adds the `variant` field (`--dry` previews, `--root <dir>` works on a copy). It is a one-off and safe to repeat; stop any running benchmark before using it, then run `npm run bench:report`. The old generated `CALLS.md` files are removed; `npm run bench:calls` writes the new `calls-latest.json`.
