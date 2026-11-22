# Per-tool-call benchmark: Blender

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `<tool>-calls` service in `npm run bench`). Method and caveats: [../README.md](../README.md).

Generated 2026-11-22. 10 upstream tools, 4 cases over 4 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service blender --iters 10`.

## Definition cost per tool

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
| **Total sent every turn** | **4,432** | **407** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 755 tokens, 17% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **1,225 characters** (fits), listing every function at detail level 2 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../README.md).

## Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| get_addon_status | 476 | 485 | 485 | 500 | +9.6 ms | 1,096 | 1,264 | 0/0 |
| get_scene_info | 45 | 51 | 62 | 69 | +17 ms | 193 | 222 | 0/0 |
| execute_blender_code | 48 | 52 | 62 | 69 | +14 ms | 45 | 72 | 0/0 |
| look | 199 | 215 | 252 | 255 | +53 ms | 411,191 | 411,319 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 9.7 ms, p95 13 ms. This is the floor of codemode's per-call overhead.

## Coverage

Cases cover 4 of 10 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| disable_telemetry | Changes the upstream's settings; not a read. |
| record_trajectory_feedback | Writes feedback into the upstream's telemetry. |
| generate_3d | Calls a paid external generator and takes minutes. |
| generate_gaussian_world | Calls a paid external generator and takes minutes. |
| search_assets | Asset libraries are switched off in the test Blender; network-bound and non-deterministic. |
| import_asset | Downloads from external libraries; non-deterministic. |

## Cases

| Case | Arguments | Model prompt |
|---|---|---|
| get_addon_status | `{}` | yes |
| get_scene_info | `{}` | yes |
| execute_blender_code | `{"code":"print('codemode-ok-4821')"}` | yes |
| look | `{}` | latency only |
