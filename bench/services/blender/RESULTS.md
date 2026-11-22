# Benchmark: Blender, direct MCP vs codemode

- Both paths drive the same live Blender through the same upstream (`blender-mcp`).
- The scene is reset before every run; pass/fail comes from a snapshot of the resulting scene (positions, sizes, names, materials), not from the model's claim.
- The test Blender had its asset libraries (Poly Haven, Sketchfab, ...) switched off, so search/import tasks are not included.
- The upstream `blender-mcp` sends its own telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** Every run WIPES the open Blender scene. Needs Blender open with the BlenderMCP addon connected (localhost:9876).

## Models

Runs are grouped by model family, then by model id. Each family is produced by one runner, and every family uses the same tasks and prompts; token counts are comparable within a family, not necessarily across runners, because each harness sends its own system prompt and tool guidance.

### Claude

Runner: `claude`.

- `claude-sonnet-5-5`: 42 runs in `scenarios`, `calls`

## Variant: `scenarios`, multi-step scenario tasks

- Both paths expose every tool of the upstream `blender-mcp`.

Reproduce: `npm run bench -- --service blender --variant scenarios --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| table | 3/3 / 3/3 | 35,004 | 8,627 | **-75%** | 13.1s | 13.2s | **1%** | $0.027 | $0.026 |
| grid | 3/3 / 3/3 | 18,337 | 3,831 | **-79%** | 9.3s | 8.8s | **-5%** | $0.016 | $0.011 |
| inspect-modify | 3/3 / 3/3 | 27,826 | 6,477 | **-77%** | 9.4s | 8.9s | **-5%** | $0.020 | $0.015 |
| audit | 3/3 / 3/3 | 33,741 | 13,159 | **-61%** | 12.4s | 13.7s | **11%** | $0.047 | $0.044 |

Token change ranges from **-79%** (grid) to **-61%** (audit).

##### Task: table

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.7 | 2.7 | 8,606 | 822 | 842 | 33,341 | 35,004 | $0.027 | 13.1s |
| codemode | 3/3 | 3.3 | 2.3 | 1,469 | 989 | 1,532 | 6,107 | 8,627 | $0.026 | 13.2s |

##### Task: grid

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,602 | 580 | 354 | 17,403 | 18,337 | $0.016 | 9.3s |
| codemode | 3/3 | 2.0 | 1.0 | 1,465 | 466 | 567 | 2,798 | 3,831 | $0.011 | 8.8s |

##### Task: inspect-modify

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 8,549 | 392 | 1,009 | 26,425 | 27,826 | $0.020 | 9.4s |
| codemode | 3/3 | 3.0 | 2.0 | 1,412 | 436 | 1,160 | 4,881 | 6,477 | $0.015 | 8.9s |

##### Task: audit

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 8,641 | 776 | 4,388 | 28,577 | 33,741 | $0.047 | 12.4s |
| codemode | 3/3 | 3.0 | 2.0 | 1,504 | 906 | 4,695 | 7,559 | 13,159 | $0.044 | 13.7s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 12/12 | 2.9 | 1.9 | 8,600 | 642 | 1,649 | 26,436 | 28,727 | $0.027 | 11.0s |
| codemode | 12/12 | 2.8 | 1.8 | 1,463 | 699 | 1,988 | 5,336 | 8,024 | $0.024 | 11.2s |

Total tokens, codemode vs direct: **-72%** (8,024 vs 28,727).

Wall time, codemode vs direct: **1%** (11.2s vs 11.0s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

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
| get_addon_status | 3/3 / 3/3 | 17,749 | 3,002 | **-83%** | 7.0s | 6.6s | **-5%** | $0.007 | $0.006 |
| get_scene_info | 3/3 / 3/3 | 17,347 | 3,098 | **-82%** | 6.7s | 7.0s | **5%** | $0.008 | $0.004 |
| execute_blender_code | 3/3 / 3/3 | 17,333 | 3,088 | **-82%** | 6.7s | 6.9s | **3%** | $0.008 | $0.005 |

Token change ranges from **-83%** (get_addon_status) to **-82%** (get_scene_info).

##### Task: get_addon_status

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,478 | 53 | 238 | 17,458 | 17,749 | $0.007 | 7.0s |
| codemode | 3/3 | 2.0 | 1.0 | 1,347 | 125 | 600 | 2,277 | 3,002 | $0.006 | 6.6s |

##### Task: get_scene_info

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,485 | 116 | 172 | 17,058 | 17,347 | $0.008 | 6.7s |
| codemode | 3/3 | 2.0 | 1.0 | 1,354 | 121 | 239 | 2,738 | 3,098 | $0.004 | 7.0s |

##### Task: execute_blender_code

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,491 | 147 | 29 | 17,157 | 17,333 | $0.008 | 6.7s |
| codemode | 3/3 | 2.0 | 1.0 | 1,360 | 148 | 277 | 2,663 | 3,088 | $0.005 | 6.9s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.0 | 1.0 | 8,485 | 105 | 146 | 17,225 | 17,476 | $0.008 | 6.8s |
| codemode | 9/9 | 2.0 | 1.0 | 1,354 | 131 | 372 | 2,559 | 3,063 | $0.005 | 6.8s |

Total tokens, codemode vs direct: **-82%** (3,063 vs 17,476).

Wall time, codemode vs direct: **1%** (6.8s vs 6.8s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

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
