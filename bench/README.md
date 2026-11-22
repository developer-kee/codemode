# Benchmarks

Each service wrapped by codemode is benchmarked **separately**. For every service, Claude does the same tasks twice, on the same model: once with the upstream MCP server used directly, once with the same server behind codemode (a single `execute_code` tool over a typed `codemode.*` API). The harness measures **tokens, cost, turns and wall time**, and checks the result objectively.

| Service | Folder | Results |
|---|---|---|
| Blender | [blender/](blender/) | [blender/RESULTS.md](blender/RESULTS.md) |
| Windows ([Windows-MCP](https://github.com/CursorTouch/Windows-MCP)) | [windows/](windows/) | [windows/RESULTS.md](windows/RESULTS.md) |
| Playwright ([@playwright/mcp](https://github.com/microsoft/playwright-mcp), local test site) | [playwright/](playwright/) | [playwright/RESULTS.md](playwright/RESULTS.md) |

[RESULTS.md](RESULTS.md) is the overview, one row per service and variant. All `RESULTS.md` files are generated from the raw runs; do not edit them by hand.

> **Read the warning for a service before running its benchmark.** Blender runs wipe the open scene. Windows runs give the model real PowerShell and file access on your PC (the `scenarios` variant exposes every Windows-MCP tool, including screenshots and input). Playwright drives a headless browser limited to a local test site. The warning is printed when a run starts and is repeated at the top of each service's `RESULTS.md`.

## Layout

One folder per service, named like `services/<id>.ts`, holding everything about that service.

```
bench/
  run.ts            npm run bench -- --service <id> [--variant <v>] ...     (model-driven runs)
  calls.ts          npm run bench:calls -- --service <id>                     (deterministic per-call benchmark)
  report.ts         npm run bench:report                                      (rebuild every RESULTS.md)
  registry.ts       the list of benchmarked services
  RESULTS.md        generated overview, one row per service and variant
  lib/              shared harness: Claude runner, report builder, per-call benchmark, types
  <service>/
    index.ts        BenchService: warning, notes, preflight, and its named variants
    tasks.ts        scenario tasks, each with its own setup and objective check
    cases.ts        per-tool-call cases (data only)
    (extras)        e.g. blender/socket.ts, playwright/fixture.ts
    results/        raw runs, one JSON line per run, all variants together (`variant` field on each record)
    results-archive/  superseded runs, kept for reference (not in the reports)
    calls-latest.json  output of `bench:calls`: static definition costs, latency, coverage
    RESULTS.md      generated report for this service
```

## Variants

A service offers named variants of the benchmark; every run record carries its `variant`, and `--variant` selects one (default `scenarios`). `npm run bench -- --list` shows what each service has.

| Variant | What it runs |
|---|---|
| `scenarios` | The multi-step scenario tasks (Blender: table, grid, inspect-modify, audit; Windows: files, inventory, organize; Playwright: catalog-sum, form, top-rated). Both paths expose every upstream tool. |
| `scenarios-4-tools` | Windows only: the original benchmark that whitelisted `FileSystem,PowerShell,Process,Wait` on both paths (no screen or input tools). Understates the schema overhead of a full install. |
| `calls` | One model-driven task per upstream tool call, generated from `cases.ts`: a prompt that makes the model call that one tool, checked against the answer or the resulting state. No single tool can dominate the totals. |

Records without a `variant` field (written before variants existed) are read as `scenarios`.

## What is compared

| | `direct` | `codemode` |
|---|---|---|
| MCP server | the upstream, launched as a user would (`uvx ...`) | `node src/cli.ts <service>` (wraps the same upstream) |
| Tools the model sees | every upstream tool in the benchmark set | 1 tool: `execute_code` |
| Model | same | same |
| Prompt, system prompt | same | same |
| Claude Code built-in tools | disabled | disabled |

Everything else is held equal: same machine and target application, same upstream behaviour (including its telemetry), same task text, same budget cap.

## Method

For each repeat, task and path (path order alternates between repeats so cache warm-up and machine drift don't favour one side):

1. **Prepare**: the task resets the tool's world to a known state and seeds it if needed (Blender: empty and seed the scene over the addon socket; Windows: recreate a sandbox folder with seeded files).
2. **Run** Claude Code headless (`claude -p --output-format stream-json --verbose`) with only that path's MCP server, built-in tools off (`--tools ""`), no skills (`--disable-slash-commands`), no user/project settings (`--setting-sources ""`), no session persistence, a fixed one-line system prompt per service, and a per-run spend cap (`--max-budget-usd`, default $2). The working directory is an empty folder (`bench/work/`, git-ignored) so no `CLAUDE.md` is picked up.
3. **Verify**: the task inspects the real result (a Blender scene snapshot, or files on disk) with a check written in code. A run passes only if the state is right and, where asked, the model's one-line answer contains the correct number. The model's own claim of success is never used.
4. **Record** one JSON line in `<service>/results/<batch>.jsonl`; `report.ts` aggregates all batches into `RESULTS.md`.

### Metrics

All token counts come from the usage reported by Claude Code for the whole run.

| Column | Meaning |
|---|---|
| Pass | Runs that passed the objective check / runs attempted |
| Turns, Tool calls | Model round trips and MCP calls |
| First-turn context | Input size of the first request: system prompt + tool definitions + task. Isolates the fixed cost of the tool schemas |
| Output | Output tokens |
| Fresh input | `input_tokens` + cache-creation tokens |
| Cache read | Tokens served from prompt cache (cheaper per token, but they grow with every turn) |
| Total tokens | Fresh input + cache read + output |
| Cost | `total_cost_usd` as reported by Claude Code |
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
| `top-rated` | A rated list over 6 pages with a "Next page" link: find the highest rating |

## Run it

Prerequisites: Node 24+ with `npm install` done in the repo root; `uvx` available; Claude Code logged in (`claude auth login`; the desktop app's login is separate) or an API key in the environment; plus each service's own prerequisites above.

> Runs spend your Claude usage. The recorded Blender run (24 runs) cost under $1 in total at Sonnet prices.

```powershell
npm run bench -- --list                                       # services, variants and their tasks
npm run bench -- --service blender --runs 3                   # default variant (scenarios), both paths
npm run bench -- --service windows --variant scenarios-4-tools --runs 3
npm run bench -- --service playwright --variant calls --runs 1   # one model-driven task per tool call
npm run bench -- --service blender --runs 1 --tasks table,grid
npm run bench -- --service windows --model claude-opus-5-5 --runs 3
npm run bench:calls -- --service blender --iters 10           # no model: definition cost + latency -> blender/calls-latest.json
npm run bench:report                                          # rebuild every RESULTS.md from results/*.jsonl and calls-latest.json
```

Options of `bench`: `--service`, `--variant` (default `scenarios`), `--runs`, `--model`, `--tasks`, `--paths direct,codemode`, `--budget` (USD per run), `--timeout` (seconds per run). `bench:calls` takes `--service` and `--iters`; it connects to the service's default variant (all tools) and needs the same prerequisites.

Reports group by variant and then by model, so runs with different models sit side by side. Batches accumulate; delete a `results/*.jsonl` file to drop that batch (or move it to `results-archive/<name>/` to keep it).

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

Keep tasks deterministic: fixed seed data, no network or asset-library dependence, tolerances on numeric checks. Run `npx tsc` to typecheck.

To add a per-tool-call case, add an entry in `<service>/cases.ts`: `tool` and `args` give the deterministic latency measurement, `before` any setup calls, and `prompt` plus `expect` (or `check`) make it a task of the `calls` variant. Every upstream tool must either have a case or be listed in `skipped` with the reason.

## Add a service

1. Add the service to `services/<id>.ts` (see the main README).
2. Create `bench/<id>/` with
   - `tasks.ts`: the scenario tasks;
   - `cases.ts`: a `CallDef` (`cases`, `skipped`, `reset`), data only;
   - `index.ts`: a `BenchService` ([lib/types.ts](lib/types.ts)) with the `warning`, `notes`, `preflight`, and its `variants`. Each variant gives the direct upstream command, an env for the codemode wrapper so both paths expose the same tools, a system prompt, `notes` and `tasks`. Define the `scenarios` variant, then add `callsVariant(scenarios, cases)` ([lib/calls.ts](lib/calls.ts)) to get the `calls` variant. Add more variants (like Windows' `scenarios-4-tools`) when the same tasks should run against a different tool set.
3. Register it in [registry.ts](registry.ts). `npm run bench -- --list` should show it.

Prefer tasks that are safe to repeat and fully checkable from outside the model. Think about side effects first and say them in `warning`.

## Raw data format

`<service>/results/<batch>.jsonl`, one object per run, all variants of the service together:

```
{ batch, variant, task, model, repeat, pass, verdict,
  run: { path, ok, error?, answer, turns, toolCalls, toolNames[], availableTools[],
         firstTurnContext, usage: { input, cacheWrite, cacheRead, output },
         costUsd, durationMs, apiMs? } }
```

`variant` is the variant id (`scenarios`, `scenarios-4-tools`, `calls`); a record without it counts as `scenarios`. `availableTools` is recorded at start-up to prove built-in tools were off and only the intended MCP tools were visible.

## Limitations (read before quoting numbers)

- **Small sample.** Typically 3 runs per task and path, one model, one machine, one day. Wall-time differences of a few percent are noise.
- **Services are not comparable with each other.** Task difficulty, the number of upstream tools and the benchmark's tool whitelist differ per service.
- **The saving is mostly tool-definition overhead.** Direct sends every upstream tool schema each turn; codemode sends one. Where the model uses only one upstream tool anyway (Blender: run Python), the benchmark does not exercise **chaining several different upstream tools in one script**, which is where codemode is meant to help most.
- **`scenarios-4-tools` understates the schema overhead.** The real Windows-MCP server offers 20 tools; that variant exposes four. The `scenarios` variant exposes all 20.
- **Description truncation (verified).** The typed API is placed in the `execute_code` tool description, and Claude Code cuts MCP tool descriptions at about 2,048 characters: asking the model to quote it returned about 2,070 characters ending "… [truncated]", and codemode first-turn context stays near 1.7k tokens for both services whatever the API size. The callable member list comes last in the description, so the model never saw it. Codemode savings in `RESULTS.md` are therefore an **upper bound**: part of the saving is missing information, not compression. See [../docs/landscape.md](../docs/landscape.md) for the planned fix and for other metrics to add.
- **Prompt cache.** Cache-read tokens depend on caching behaviour and vary between runs; that is why `Fresh input`, `Cache read` and `Total` are shown separately.
- **Telemetry.** The upstream servers send their own telemetry on both paths. It was left on to keep the paths identical.
- **Task difficulty.** All tasks are doable with one script. Harder or more tool-diverse tasks may change the picture, in either direction.

## Tested with

| | |
|---|---|
| Date | 2026-11-22 |
| Model | `claude-sonnet-5-5` |
| Claude Code | 2.1.229 |
| Blender | 5.3.0, BlenderMCP addon 2.0 (protocol 16) |
| `blender-mcp` (upstream, via uvx) | 2.0.0 |
| `windows-mcp` (upstream, via uvx) | 0.8.5 |
| Node | 24.14.0 |
| `@modelcontextprotocol/sdk` | 1.32.2 |
| `quickjs-emscripten` | 0.32.0 |
| OS | Windows 11 |

## Moving from the old layout

Before the one-folder-per-service layout, each variant had its own folder (`blender-calls`, `windows-full`, `windows-calls`, and `windows` meaning the 4-tool run). `node bench/migrate.ts` moves those results into the service folders and adds the `variant` field (`--dry` previews, `--root <dir>` works on a copy). It is a one-off and safe to repeat; stop any running benchmark before using it, then run `npm run bench:report`. The old generated `CALLS.md` files are removed; `npm run bench:calls` writes the new `calls-latest.json`.
