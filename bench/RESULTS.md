# Benchmark: direct blender-mcp vs codemode

Both paths drive the same live Blender through the same upstream (`blender-mcp`), with the same model, the same prompt, built-in tools disabled, and the scene reset before every run.
Numbers are means over runs. `Pass` is an objective check of the resulting scene (positions, sizes, names, materials), not the model's own claim.
Reproduce: `npm run bench -- --runs 3`. Full method, metric definitions and limitations: [README.md](README.md).

## Model: `claude-sonnet-5-5`

### Task: table

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 4.0 | 3.0 | 8,606 | 924 | 1,364 | 36,261 | 38,549 | $0.033 | 14.6s |
| codemode | 3/3 | 2.3 | 1.3 | 1,712 | 892 | 1,163 | 4,337 | 6,392 | $0.022 | 12.2s |

### Task: grid

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 8,602 | 583 | 174 | 17,583 | 18,340 | $0.015 | 9.6s |
| codemode | 3/3 | 2.0 | 1.0 | 1,708 | 528 | 369 | 3,549 | 4,446 | $0.011 | 9.3s |

### Task: inspect-modify

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 8,549 | 373 | 688 | 26,719 | 27,780 | $0.018 | 9.9s |
| codemode | 3/3 | 3.0 | 2.0 | 1,655 | 409 | 1,026 | 5,724 | 7,160 | $0.014 | 9.3s |

### Task: audit

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 8,641 | 976 | 3,649 | 29,744 | 34,369 | $0.045 | 13.9s |
| codemode | 3/3 | 3.0 | 2.0 | 1,747 | 988 | 4,104 | 8,427 | 13,519 | $0.042 | 13.7s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 12/12 | 3.0 | 2.0 | 8,600 | 714 | 1,469 | 27,577 | 29,760 | $0.028 | 12.0s |
| codemode | 12/12 | 2.6 | 1.6 | 1,706 | 705 | 1,666 | 5,509 | 7,879 | $0.022 | 11.1s |

Total tokens, codemode vs direct: **-74%** (7,879 vs 29,760).

Wall time, codemode vs direct: **-7%** (11.1s vs 12.0s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and Blender execution.

## How to read this

- Most of the token saving comes from tool definitions: direct sends ten Blender tool schemas on every turn, codemode sends one (see "First-turn context").
- In both paths the model mostly used the same underlying tool (run Python in Blender), so these tasks do not exercise chaining several different upstream tools in one script. That is where codemode should help most, and it is not measured here.
- The asset libraries in the test Blender were switched off, so search/import tasks (non-deterministic and network-bound) are not included.
- The typed `codemode.*` API lives in the tool description. Claude Code may shorten long MCP tool descriptions; this has not been verified here, and the model may have seen only part of the API.
- 3 runs per task and path, one model, one machine: treat small differences (especially wall time) as noise.

## Task prompts

Identical text is sent on both paths. Method and limitations: [README.md](README.md).

- **table**: In the empty Blender scene build a simple table. A box named TableTop, 2 x 1 x 0.1 (x, y, z), centred on x=0 and y=0, with its top surface at z=1. Four cylinders named Leg_1, Leg_2, Leg_3, Leg_4, each radius 0.05 and height 0.95, standing on z=0 under the four corners of the top, inset 0.1 from each edge. Then reply with one short sentence.
- **grid**: In the empty Blender scene create a 5 x 5 grid of cubes (each 1 unit across) named Cube_R_C for row R and column C, both 0 to 4. Cube_0_0 sits at the origin; each column step moves 3 units along +x and each row step 3 units along +y. Give every row its own material named Row_R (R = row number) with a different base colour per row, and assign it to all cubes in that row. Then reply with one short sentence.
- **inspect-modify** (pre-seeded scene): The Blender scene holds a number of objects named Crate_N and Barrel_N. Find them, then move every crate up by 2 units on Z and scale every barrel to 150% uniformly around its own origin (do not move the barrels). Reply with one short sentence that states how many objects you changed.
- **audit** (pre-seeded scene): The Blender scene holds 40 objects in five groups by name prefix: Crate, Barrel, Lamp, Pillar and Sign. Audit and fix them. First, find how many objects each group has. Then: snap every object's x and y to the nearest multiple of 2 (an object already on a multiple stays put); and any object that sinks below the ground plane (z = 0) must be raised straight up so its lowest point sits exactly on z = 0. Do not touch the height of objects that are not below ground. Reply with one short sentence that gives the number of objects you had to adjust.
