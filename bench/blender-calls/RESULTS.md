# Benchmark: Blender, one tool call per task, direct MCP vs codemode

- Each task asks for exactly one upstream tool call (3 of 4 cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.
- Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.
- Both paths drive the same live Blender through the same upstream (`blender-mcp`).
- The scene is reset before every run; pass/fail comes from a snapshot of the resulting scene (positions, sizes, names, materials), not from the model's claim.
- The test Blender had its asset libraries (Poly Haven, Sketchfab, ...) switched off, so search/import tasks are not included.
- The upstream `blender-mcp` sends its own telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Reproduce: `npm run bench -- --service blender-calls --runs 3`. Method, metric definitions and limitations: [../README.md](../README.md).

> **Warning:** Every run WIPES the open Blender scene. Needs Blender open with the BlenderMCP addon connected (localhost:9876).

## Model: `claude-sonnet-5-5`

### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| get_addon_status | 3/3 / 3/3 | 17,749 | 3,002 | **-83%** | 7.0s | 6.6s | **-5%** | $0.007 | $0.006 |
| get_scene_info | 3/3 / 3/3 | 17,347 | 3,098 | **-82%** | 6.7s | 7.0s | **5%** | $0.008 | $0.004 |
| execute_blender_code | 3/3 / 3/3 | 17,333 | 3,088 | **-82%** | 6.7s | 6.9s | **3%** | $0.008 | $0.005 |

Token change ranges from **-83%** (get_addon_status) to **-82%** (get_scene_info).

### Task: get_addon_status

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,478 | 53 | 238 | 17,458 | 17,749 | $0.007 | 7.0s |
| codemode | 3/3 | 2.0 | 1.0 | 1,347 | 125 | 600 | 2,277 | 3,002 | $0.006 | 6.6s |

### Task: get_scene_info

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,485 | 116 | 172 | 17,058 | 17,347 | $0.008 | 6.7s |
| codemode | 3/3 | 2.0 | 1.0 | 1,354 | 121 | 239 | 2,738 | 3,098 | $0.004 | 7.0s |

### Task: execute_blender_code

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,491 | 147 | 29 | 17,157 | 17,333 | $0.008 | 6.7s |
| codemode | 3/3 | 2.0 | 1.0 | 1,360 | 148 | 277 | 2,663 | 3,088 | $0.005 | 6.9s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.0 | 1.0 | 8,485 | 105 | 146 | 17,225 | 17,476 | $0.008 | 6.8s |
| codemode | 9/9 | 2.0 | 1.0 | 1,354 | 131 | 372 | 2,559 | 3,063 | $0.005 | 6.8s |

Total tokens, codemode vs direct: **-82%** (3,063 vs 17,476).

Wall time, codemode vs direct: **1%** (6.8s vs 6.8s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths.

- **get_addon_status** (pre-seeded): Check the connected Blender and tell me its version number in one short sentence.
- **get_scene_info** (pre-seeded): How many objects are in the Blender scene and what is each one called? Reply with one short sentence.
- **execute_blender_code** (pre-seeded): Run Python in Blender that prints the text codemode-ok-4821, then tell me exactly what it printed.
