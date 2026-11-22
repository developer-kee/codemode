# Benchmarks

Each tool wrapped by codemode is benchmarked **separately**. For every tool, Claude does the same tasks twice, on the same model: once with the upstream MCP server used directly, once with the same server behind codemode (a single `execute_code` tool over a typed `codemode.*` API). The harness measures **tokens, cost, turns and wall time**, and checks the result objectively.

| Tool | Folder | Results |
|---|---|---|
| Blender | [blender/](blender/) | [blender/RESULTS.md](blender/RESULTS.md) |
| Windows ([Windows-MCP](https://github.com/CursorTouch/Windows-MCP)) | [windows/](windows/) | [windows/RESULTS.md](windows/RESULTS.md) |

[RESULTS.md](RESULTS.md) is the overview across tools. All `RESULTS.md` files are generated from the raw runs; do not edit them by hand.

> **Read the warning for a tool before running its benchmark.** Blender runs wipe the open scene. Windows runs give the model real PowerShell and file access on your PC. The warning is printed when a run starts and is repeated at the top of each tool's `RESULTS.md`.

## Layout

```
bench/
  run.ts            entry point:  npm run bench -- --service <id> ...
  report.ts         rebuilds every RESULTS.md from recorded runs
  registry.ts       the list of benchmarked tools
  lib/              shared harness: Claude runner, report builder, types
  <tool>/
    index.ts        BenchService: how to launch the upstream, system prompt, warning, tasks
    tasks.ts        the tasks, each with its own setup and objective check
    results/*.jsonl raw data, one JSON line per run
    RESULTS.md      generated report for this tool
```

## What is compared

| | `direct` | `codemode` |
|---|---|---|
| MCP server | the upstream, launched as a user would (`uvx ...`) | `node src/cli.ts <tool>` (wraps the same upstream) |
| Tools the model sees | every upstream tool in the benchmark set | 1 tool: `execute_code` |
| Model | same | same |
| Prompt, system prompt | same | same |
| Claude Code built-in tools | disabled | disabled |

Everything else is held equal: same machine and target application, same upstream behaviour (including its telemetry), same task text, same budget cap.

## Method

For each repeat, task and path (path order alternates between repeats so cache warm-up and machine drift don't favour one side):

1. **Prepare**: the task resets the tool's world to a known state and seeds it if needed (Blender: empty and seed the scene over the addon socket; Windows: recreate a sandbox folder with seeded files).
2. **Run** Claude Code headless (`claude -p --output-format stream-json --verbose`) with only that path's MCP server, built-in tools off (`--tools ""`), no skills (`--disable-slash-commands`), no user/project settings (`--setting-sources ""`), no session persistence, a fixed one-line system prompt per tool, and a per-run spend cap (`--max-budget-usd`, default $2). The working directory is an empty folder (`bench/work/`, git-ignored) so no `CLAUDE.md` is picked up.
3. **Verify**: the task inspects the real result (a Blender scene snapshot, or files on disk) with a check written in code. A run passes only if the state is right and, where asked, the model's one-line answer contains the correct number. The model's own claim of success is never used.
4. **Record** one JSON line in `<tool>/results/<batch>.jsonl`; `report.ts` aggregates all batches into `RESULTS.md`.

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

## Tools and tasks

The exact prompts are repeated at the bottom of each tool's `RESULTS.md`. Prompts never name tools, so each path chooses its own.

### Blender

Needs Blender open with the [BlenderMCP addon](https://github.com/ahujasid/blender-mcp) connected on `localhost:9876` (a copy is in `vendor/addon.py`). Every run **wipes the open scene**. The check uses the world-space bounding-box centre of each object rather than its origin, so correct geometry built with the origin elsewhere is not marked wrong (an early version used the origin and wrongly failed correct tables on both paths; fixed before any published numbers).

| Task | What it tests |
|---|---|
| `table` | Build a specified table (top + four legs) from an empty scene; exact sizes and positions |
| `grid` | 5 x 5 grid of cubes with per-row materials: many similar objects |
| `inspect-modify` | Pre-seeded scene (8 crates, 4 barrels): find objects by name, edit two groups differently, report how many changed |
| `audit` | 40 pre-seeded objects in five groups with known off-grid and below-ground cases: count, snap to a grid, fix heights conditionally, report how many needed fixing |

### Windows

Uses [Windows-MCP](https://github.com/CursorTouch/Windows-MCP) (`uvx windows-mcp serve`). The benchmark whitelists four **non-visual** tools on both paths, `FileSystem,PowerShell,Process,Wait`, so no run can capture the screen or send input to the desktop, and the registry is untouched. All tasks work inside one sandbox folder (`%TEMP%\codemode-bench-windows`) that is deleted and recreated before every run. The model still has real PowerShell, so it could in principle act outside that folder; run this only on a machine where that is acceptable.

| Task | What it tests |
|---|---|
| `files` | Create a folder tree and four files with exact contents, plus an index file |
| `inventory` | 30 seeded files: filter by extension, sort by size with tie-breaks, write a CSV, report a computed total |
| `organize` | 40 loose seeded files: move each into a folder named after its upper-cased extension, nothing lost or renamed, report the count |

## Run it

Prerequisites: Node 24+ with `npm install` done in the repo root; `uvx` available; Claude Code logged in (`claude auth login`; the desktop app's login is separate) or an API key in the environment; plus each tool's own prerequisites above.

> Runs spend your Claude usage. The recorded Blender run (24 runs) cost under $1 in total at Sonnet prices.

```powershell
npm run bench -- --list                                       # tools and their tasks
npm run bench -- --service blender --runs 3                   # all Blender tasks, both paths
npm run bench -- --service windows --runs 3
npm run bench -- --service blender --runs 1 --tasks table,grid
npm run bench -- --service windows --model claude-opus-5-5 --runs 3
npm run bench:report                                          # rebuild every RESULTS.md from results/*.jsonl
```

Options: `--service`, `--runs`, `--model`, `--tasks`, `--paths direct,codemode`, `--budget` (USD per run), `--timeout` (seconds per run).

Reports group by model, so runs with different models sit side by side. Batches accumulate; delete a `results/*.jsonl` file to drop that batch.

## Add a task to a tool

Add an entry in `<tool>/tasks.ts` (Blender: a spec with `seed`, `prompt`, `verify`; Windows: a `Task` with `prepare` and `verify`):

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

## Add a tool

1. Add the service to `services/<id>.ts` (see the main README).
2. Create `bench/<id>/index.ts` exporting a `BenchService` ([lib/types.ts](lib/types.ts)): the direct upstream command, an env for the codemode wrapper so both paths expose the same tools, a system prompt, a `warning`, `notes`, `tasks` and a `preflight`.
3. Write `bench/<id>/tasks.ts`.
4. Register it in [registry.ts](registry.ts).

Prefer tasks that are safe to repeat and fully checkable from outside the model. Think about side effects first and say them in `warning`.

## Raw data format

`<tool>/results/<batch>.jsonl`, one object per run:

```
{ batch, task, model, repeat, pass, verdict,
  run: { path, ok, error?, answer, turns, toolCalls, toolNames[], availableTools[],
         firstTurnContext, usage: { input, cacheWrite, cacheRead, output },
         costUsd, durationMs, apiMs? } }
```

`availableTools` is recorded at start-up to prove built-in tools were off and only the intended MCP tools were visible.

## Limitations (read before quoting numbers)

- **Small sample.** Typically 3 runs per task and path, one model, one machine, one day. Wall-time differences of a few percent are noise.
- **Tools are not comparable with each other.** Task difficulty, the number of upstream tools and the benchmark's tool whitelist differ per tool.
- **The saving is mostly tool-definition overhead.** Direct sends every upstream tool schema each turn; codemode sends one. Where the model uses only one upstream tool anyway (Blender: run Python), the benchmark does not exercise **chaining several different upstream tools in one script**, which is where codemode is meant to help most.
- **Windows understates the schema overhead.** The real Windows-MCP server offers 20 tools; the benchmark exposes four.
- **Description truncation (verified).** The typed API is placed in the `execute_code` tool description, and Claude Code cuts MCP tool descriptions at about 2,048 characters: asking the model to quote it returned about 2,070 characters ending "… [truncated]", and codemode first-turn context stays near 1.7k tokens for both tools whatever the API size. The callable member list comes last in the description, so the model never saw it. Codemode savings in `RESULTS.md` are therefore an **upper bound**: part of the saving is missing information, not compression. See [../docs/landscape.md](../docs/landscape.md) for the planned fix and for other metrics to add.
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

