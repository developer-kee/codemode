# Benchmark: Blender, direct MCP vs codemode

- Both paths drive the same live Blender through the same upstream (`blender-mcp`).
- The scene is reset before every run; pass/fail comes from a snapshot of the resulting scene (positions, sizes, names, materials), not from the model's claim.
- The test Blender had its asset libraries (Poly Haven, Sketchfab, ...) switched off, so search/import tasks are not included.
- The upstream `blender-mcp` sends its own telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** Every run WIPES the open Blender scene. Needs Blender open with the BlenderMCP addon connected (localhost:9876).

## TL;DR

Codemode compared with the same server used directly. Left number is codemode, right is direct.

- **`scenarios`, `claude-sonnet-5-5`:** tokens **-71%** (8,108 vs 27,678), time **0%** (11.6s vs 11.5s), cost **-24%** ($0.024 vs $0.032), passed 12/12 vs 12/12.
- **`calls`, `claude-sonnet-5-5`:** tokens **-82%** (3,090 vs 17,468), time **-1%** (7.0s vs 7.1s), cost **-58%** ($0.004 vs $0.010), passed 9/9 vs 9/9.
- **Tool definitions sent every turn:** 422 vs 4,432 tokens (-90%), 10 tools.
- **Latency of one call (no model):** median overhead +2 ms across 4 cases.
- **Verdict (`scenarios`):** Saves a lot of tokens with similar time (tokens -71%, time +0%).

## Models

Detailed results below are grouped by model family. Each family is produced by one runner and uses the same tasks and prompts; token counts are comparable within a family, not necessarily across runners, because each harness sends its own system prompt and tool guidance.

| Model | Provider | Runner | Runs | Variants |
|---|---|---|---|---|
| `claude-sonnet-5-5` | Claude | `claude` | 42 | `scenarios`, `calls` |

## Variant: `scenarios`, multi-step scenario tasks

- Both paths expose every tool of the upstream `blender-mcp`.

Reproduce: `npm run bench -- --service blender --variant scenarios --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| table | 3/3 / 3/3 | 31,592 | 9,720 | **-69%** | 13.3s | 14.3s | **8%** | $0.044 | $0.031 |
| grid | 3/3 / 3/3 | 18,261 | 3,972 | **-78%** | 10.0s | 9.0s | **-10%** | $0.018 | $0.012 |
| inspect-modify | 3/3 / 3/3 | 27,776 | 6,678 | **-76%** | 9.4s | 9.5s | **1%** | $0.021 | $0.015 |
| audit | 3/3 / 3/3 | 33,085 | 12,061 | **-64%** | 13.5s | 13.6s | **0%** | $0.045 | $0.039 |

Token change ranges from **-78%** (grid) to **-64%** (audit).

##### Task: table

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.3 | 2.3 | 8,606 | 761 | 4,024 | 26,807 | 31,592 | $0.044 | 13.3s |
| codemode | 3/3 | 3.7 | 2.7 | 1,494 | 1,098 | 2,042 | 6,580 | 9,720 | $0.031 | 14.3s |

##### Task: grid

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,602 | 551 | 832 | 16,878 | 18,261 | $0.018 | 10.0s |
| codemode | 3/3 | 2.0 | 1.0 | 1,490 | 522 | 602 | 2,848 | 3,972 | $0.012 | 9.0s |

##### Task: inspect-modify

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 8,549 | 373 | 1,298 | 26,105 | 27,776 | $0.021 | 9.4s |
| codemode | 3/3 | 3.0 | 2.0 | 1,437 | 457 | 1,138 | 5,083 | 6,678 | $0.015 | 9.5s |

##### Task: audit

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 8,641 | 852 | 3,993 | 28,239 | 33,085 | $0.045 | 13.5s |
| codemode | 3/3 | 3.0 | 2.0 | 1,529 | 926 | 3,889 | 7,246 | 12,061 | $0.039 | 13.6s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 12/12 | 2.8 | 1.8 | 8,600 | 634 | 2,537 | 24,507 | 27,678 | $0.032 | 11.5s |
| codemode | 12/12 | 2.9 | 1.9 | 1,488 | 751 | 1,918 | 5,439 | 8,108 | $0.024 | 11.6s |

Total tokens, codemode vs direct: **-71%** (8,108 vs 27,678).

Wall time, codemode vs direct: **0%** (11.6s vs 11.5s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Variant: `calls`, one tool call per task

- Each task asks for exactly one upstream tool call (3 of 4 cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.
- Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.
- Both paths expose every tool of the upstream `blender-mcp`.

Reproduce: `npm run bench -- --service blender --variant calls --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| get_addon_status | 3/3 / 3/3 | 17,748 | 3,029 | **-83%** | 6.8s | 6.6s | **-4%** | $0.010 | $0.004 |
| get_scene_info | 3/3 / 3/3 | 17,321 | 3,114 | **-82%** | 7.0s | 7.2s | **2%** | $0.010 | $0.004 |
| execute_blender_code | 3/3 / 3/3 | 17,334 | 3,128 | **-82%** | 7.3s | 7.2s | **-3%** | $0.010 | $0.004 |

Token change ranges from **-83%** (get_addon_status) to **-82%** (execute_blender_code).

##### Task: get_addon_status

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,478 | 53 | 764 | 16,931 | 17,748 | $0.010 | 6.8s |
| codemode | 3/3 | 2.0 | 1.0 | 1,366 | 118 | 176 | 2,735 | 3,029 | $0.004 | 6.6s |

##### Task: get_scene_info

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,485 | 132 | 434 | 16,755 | 17,321 | $0.010 | 7.0s |
| codemode | 3/3 | 2.0 | 1.0 | 1,373 | 125 | 304 | 2,685 | 3,114 | $0.004 | 7.2s |

##### Task: execute_blender_code

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,491 | 147 | 383 | 16,804 | 17,334 | $0.010 | 7.3s |
| codemode | 3/3 | 2.0 | 1.0 | 1,379 | 153 | 203 | 2,772 | 3,128 | $0.004 | 7.2s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.0 | 1.0 | 8,485 | 111 | 527 | 16,830 | 17,468 | $0.010 | 7.1s |
| codemode | 9/9 | 2.0 | 1.0 | 1,373 | 132 | 228 | 2,731 | 3,090 | $0.004 | 7.0s |

Total tokens, codemode vs direct: **-82%** (3,090 vs 17,468).

Wall time, codemode vs direct: **-1%** (7.0s vs 7.1s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Per-tool-call benchmark (no model)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../../README.md](../../README.md).

Generated 2026-11-22. 10 upstream tools, 4 cases over 4 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service blender --iters 10`.

### Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| look | 755 | 29 | 661 | yes |
| generate_3d | 690 | 31 | 657 | no |
| generate_gaussian_world | 610 | 25 | 615 | no |
| search_assets | 594 | 34 | 549 | no |
| get_scene_info | 459 | 16 | 461 | yes |
| import_asset | 450 | 27 | 433 | no |
| record_trajectory_feedback | 281 | 21 | 293 | no |
| get_addon_status | 253 | 9 | 283 | yes |
| execute_blender_code | 208 | 11 | 230 | yes |
| disable_telemetry | 135 | 9 | 162 | no |
| **Total sent every turn** | **4,432** | **422** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 755 tokens, 17% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **1,288 characters** (fits), listing every function at detail level 2 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../../README.md).

### Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| get_addon_status | 477 | 480 | 477 | 480 | +0.6 ms | 1,096 | 1,264 | 0/0 |
| get_scene_info | 53 | 56 | 55 | 56 | +1.8 ms | 193 | 222 | 0/0 |
| execute_blender_code | 52 | 53 | 53 | 54 | +0.9 ms | 45 | 72 | 0/0 |
| look | 201 | 215 | 218 | 224 | +17 ms | 279,627 | 20,092 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 1.0 ms, p95 1.3 ms. This is the floor of codemode's per-call overhead.

### Coverage

Cases cover 4 of 10 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| disable_telemetry | Changes the upstream's settings; not a read. |
| record_trajectory_feedback | Writes feedback into the upstream's telemetry. |
| generate_3d | Calls a paid external generator and takes minutes. |
| generate_gaussian_world | Calls a paid external generator and takes minutes. |
| search_assets | Asset libraries are switched off in the test Blender; network-bound and non-deterministic. |
| import_asset | Downloads from external libraries; non-deterministic. |

### Cases

| Case | Arguments | Model prompt |
|---|---|---|
| get_addon_status | `{}` | yes |
| get_scene_info | `{}` | yes |
| execute_blender_code | `{"code":"print('codemode-ok-4821')"}` | yes |
| look | `{}` | latency only |

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `scenarios`

- **table**: In the empty Blender scene build a simple table. A box named TableTop, 2 x 1 x 0.1 (x, y, z), centred on x=0 and y=0, with its top surface at z=1. Four cylinders named Leg_1, Leg_2, Leg_3, Leg_4, each radius 0.05 and height 0.95, standing on z=0 under the four corners of the top, inset 0.1 from each edge. Then reply with one short sentence.
- **grid**: In the empty Blender scene create a 5 x 5 grid of cubes (each 1 unit across) named Cube_R_C for row R and column C, both 0 to 4. Cube_0_0 sits at the origin; each column step moves 3 units along +x and each row step 3 units along +y. Give every row its own material named Row_R (R = row number) with a different base colour per row, and assign it to all cubes in that row. Then reply with one short sentence.
- **inspect-modify** (pre-seeded): The Blender scene holds a number of objects named Crate_N and Barrel_N. Find them, then move every crate up by 2 units on Z and scale every barrel to 150% uniformly around its own origin (do not move the barrels). Reply with one short sentence that states how many objects you changed.
- **audit** (pre-seeded): The Blender scene holds 40 objects in five groups by name prefix: Crate, Barrel, Lamp, Pillar and Sign. Audit and fix them. First, find how many objects each group has. Then: snap every object's x and y to the nearest multiple of 2 (an object already on a multiple stays put); and any object that sinks below the ground plane (z = 0) must be raised straight up so its lowest point sits exactly on z = 0. Do not touch the height of objects that are not below ground. Reply with one short sentence that gives the number of objects you had to adjust.

### `calls`

- **get_addon_status** (pre-seeded): Check the connected Blender and tell me its version number in one short sentence.
- **get_scene_info** (pre-seeded): How many objects are in the Blender scene and what is each one called? Reply with one short sentence.
- **execute_blender_code** (pre-seeded): Run Python in Blender that prints the text codemode-ok-4821, then tell me exactly what it printed.
