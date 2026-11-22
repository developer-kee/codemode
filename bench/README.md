# Benchmark: direct blender-mcp vs codemode

This benchmark measures what codemode changes in practice: **tokens, cost, turns and wall time** when Claude drives the same live Blender through (a) the upstream `blender-mcp` tools directly, and (b) the codemode wrapper (`execute_code` over a typed `codemode.*` API).

Results live in [RESULTS.md](RESULTS.md) (generated). This file explains how they are produced and how far to trust them.

## What is compared

| | `direct` | `codemode` |
|---|---|---|
| MCP server | `uvx blender-mcp` | `node src/cli.ts blender` (wraps the same `uvx blender-mcp`) |
| Tools the model sees | 10 upstream tools | 1 tool: `execute_code` |
| Model | same | same |
| Prompt, system prompt | same | same |
| Claude Code built-in tools | disabled | disabled |

Everything else is held equal: same Blender instance, same addon, same upstream telemetry behaviour, same task text, same budget cap.

## Method

For each repeat, task and path (path order alternates between repeats so cache warm-up and machine drift don't favour one side):

1. **Reset** the live Blender scene over the addon socket (`localhost:9876`): delete all objects, meshes, materials, lights, cameras.
2. **Seed** the scene if the task needs starting content.
3. **Run** Claude Code headless (`claude -p --output-format stream-json --verbose`) with only the path's MCP server, built-in tools off (`--tools ""`), no skills (`--disable-slash-commands`), no user/project settings (`--setting-sources ""`), no session persistence, a fixed one-line system prompt, and a per-run spend cap (`--max-budget-usd`, default $2). The working directory is an empty folder (`bench/work/`, git-ignored) so no `CLAUDE.md` is picked up.
4. **Snapshot** the resulting scene from Blender (world-space bounding-box centre, scale, dimensions, materials per object).
5. **Verify** the snapshot with an objective check written in code. A run passes only if the scene is right and, where asked, the model's one-line answer contains the correct count. The model's own claim of success is never used.
6. **Record** one JSON line per run in `results/<batch>.jsonl`; `report.ts` aggregates all batches into `RESULTS.md`.

### Tasks

Defined in [tasks.ts](tasks.ts); the exact prompts are repeated at the bottom of `RESULTS.md`. Prompts never name tools, so each path chooses its own.

| Task | What it tests |
|---|---|
| `table` | Build a specified table (top + four legs) from an empty scene. Exact sizes and positions. |
| `grid` | Create a 5 x 5 grid of cubes with per-row materials: many similar objects, one script's worth of work. |
| `inspect-modify` | Pre-seeded scene (8 crates, 4 barrels): find objects by name, apply different edits to two groups, report how many changed. |
| `audit` | Pre-seeded 40 objects in five groups with known off-grid and below-ground cases: count groups, snap to a grid, fix heights conditionally, report how many needed fixing. |

Verification uses the **world-space bounding-box centre**, not the object origin, so a model that builds correct geometry with its origin elsewhere is not marked wrong. (An early version of the verifier used the origin and wrongly failed correct tables on both paths; fixed before any published numbers.)

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
| Wall time | Whole headless run, including MCP server start-up, per-turn model latency and Blender execution |

`apiMs` (time waiting on the model API) is recorded for runs made after it was added; older records lack it and the report does not use it.

## Run it

Prerequisites:

- Blender open, with the [BlenderMCP addon](https://github.com/ahujasid/blender-mcp) installed and **connected** (default `localhost:9876`). A copy of the addon is in `vendor/addon.py`.
- Node 24+, `npm install` done in the repo root.
- `uvx` available (the upstream runs through it).
- Claude Code logged in: `claude auth login` (the desktop app's login is separate), or an API key in the environment.

> **Warning:** every run **wipes the open Blender scene**. Do not run this with work you care about open. Runs spend your Claude usage (the full 4-task, 3-repeat run is 24 runs; the recorded run cost under $1 in total at Sonnet prices).

```powershell
npm run bench -- --runs 3                          # all tasks, both paths
npm run bench -- --runs 1 --tasks table,grid       # a subset
npm run bench -- --model claude-opus-5-5 --runs 3  # another model
npm run bench:report                               # rebuild RESULTS.md from results/*.jsonl
```

Options: `--runs`, `--model`, `--tasks`, `--paths direct,codemode`, `--budget` (USD per run), `--timeout` (seconds per run).

The report groups by model, so runs with different models sit side by side in `RESULTS.md`. Results from different batches accumulate; delete a `results/*.jsonl` file to drop that batch.

## Add a task

Add an entry to `tasks` in [tasks.ts](tasks.ts):

```ts
{
  id: 'my-task',
  seed: `import bpy ...`,          // optional: Python run after the scene is emptied
  prompt: 'Plain-language instructions. Do not mention tool names.',
  verify(scene, answer) { /* return { pass, detail } from the snapshot */ },
}
```

Keep tasks deterministic: fixed seed data, no network or asset-library dependence, and checks with a tolerance (the existing ones use 0.02). Run `npx tsc` to typecheck.

## Raw data format

`results/<batch>.jsonl`, one object per run:

```
{ batch, task, model, repeat, pass, verdict,
  run: { path, ok, error?, answer, turns, toolCalls, toolNames[], availableTools[],
         firstTurnContext, usage: { input, cacheWrite, cacheRead, output },
         costUsd, durationMs, apiMs? } }
```

`availableTools` is recorded at start-up to prove built-in tools were off and only the intended MCP tools were visible.

## Limitations (read before quoting numbers)

- **Small sample.** 3 runs per task and path, one model, one machine, one day. Wall-time differences of a few percent are noise.
- **The saving is mostly tool-definition overhead.** Direct sends ten tool schemas every turn; codemode sends one. In both paths the model mostly called the same underlying tool (run Python in Blender), so these tasks do not exercise **chaining several different upstream tools in one script**, which is where codemode is meant to help most.
- **No asset-library tasks.** In the test Blender the asset libraries (Poly Haven, Sketchfab, etc.) were off, and search/import tasks are network-bound and non-deterministic, so they are excluded.
- **Possible description truncation.** The typed API is placed in the `execute_code` tool description. Claude Code may shorten long MCP tool descriptions, and codemode's first-turn context (about 1.7k tokens) is smaller than the generated API alone, so the model may have seen only part of it. This has not been verified.
- **Prompt cache.** Cache-read tokens depend on caching behaviour and can vary between runs; that is why `Fresh input`, `Cache read` and `Total` are shown separately.
- **Telemetry.** The upstream `blender-mcp` sends its own telemetry on both paths. It was left on to keep the paths identical.
- **Task difficulty.** All tasks are scriptable in a single Python snippet. Harder or more tool-diverse tasks may change the picture, in either direction.

## Tested with

| | |
|---|---|
| Date | 2026-11-22 |
| Model | `claude-sonnet-5-5` |
| Claude Code | 2.1.229 |
| Blender | 5.3.0, BlenderMCP addon 2.0 (protocol 16) |
| `blender-mcp` (upstream, via uvx) | 2.0.0 |
| Node | 24.14.0 |
| `@modelcontextprotocol/sdk` | 1.32.2 |
| `quickjs-emscripten` | 0.32.0 |
| OS | Windows 11 |
