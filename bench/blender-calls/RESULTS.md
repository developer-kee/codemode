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
| get_addon_status | 1/1 / 1/1 | 17,745 | 3,475 | **-80%** | 6.9s | 7.0s | **1%** | $0.015 | $0.013 |
| get_scene_info | 1/1 / 1/1 | 17,345 | 3,535 | **-80%** | 6.9s | 7.3s | **5%** | $0.014 | $0.006 |
| execute_blender_code | 1/1 / 1/1 | 17,337 | 3,497 | **-80%** | 6.8s | 6.4s | **-6%** | $0.013 | $0.005 |

Token change ranges from **-80%** (get_addon_status) to **-80%** (get_scene_info).

### Task: get_addon_status

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 8,478 | 53 | 1,582 | 16,110 | 17,745 | $0.015 | 6.9s |
| codemode | 1/1 | 2.0 | 1.0 | 1,587 | 121 | 1,769 | 1,585 | 3,475 | $0.013 | 7.0s |

### Task: get_scene_info

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 8,485 | 158 | 1,070 | 16,117 | 17,345 | $0.014 | 6.9s |
| codemode | 1/1 | 2.0 | 1.0 | 1,594 | 143 | 476 | 2,916 | 3,535 | $0.006 | 7.3s |

### Task: execute_blender_code

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 8,491 | 148 | 1,066 | 16,123 | 17,337 | $0.013 | 6.8s |
| codemode | 1/1 | 2.0 | 1.0 | 1,600 | 119 | 456 | 2,922 | 3,497 | $0.005 | 6.4s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,485 | 120 | 1,239 | 16,117 | 17,476 | $0.014 | 6.9s |
| codemode | 3/3 | 2.0 | 1.0 | 1,594 | 128 | 900 | 2,474 | 3,502 | $0.008 | 6.9s |

Total tokens, codemode vs direct: **-80%** (3,502 vs 17,476).

Wall time, codemode vs direct: **-0%** (6.9s vs 6.9s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths.

- **get_addon_status** (pre-seeded): Check the connected Blender and tell me its version number in one short sentence.
- **get_scene_info** (pre-seeded): How many objects are in the Blender scene and what is each one called? Reply with one short sentence.
- **execute_blender_code** (pre-seeded): Run Python in Blender that prints the text codemode-ok-4821, then tell me exactly what it printed.
