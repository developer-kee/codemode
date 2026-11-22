# Per-tool-call benchmark: Blender

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `<tool>-calls` service in `npm run bench`). Method and caveats: [../README.md](../README.md).

Generated 2026-11-22. 10 upstream tools, 4 cases over 4 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service blender --iters 10`.

## Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON; `codemode` is that tool's slice of the generated TypeScript API. Tokens are estimated as characters / 4, good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode (≈ tokens) | In per-call cases |
|---|---|---|---|
| look | 755 | 661 | yes |
| generate_3d | 690 | 657 | no |
| generate_gaussian_world | 610 | 615 | no |
| search_assets | 594 | 549 | no |
| get_scene_info | 459 | 461 | yes |
| import_asset | 450 | 433 | no |
| record_trajectory_feedback | 281 | 293 | no |
| get_addon_status | 253 | 283 | yes |
| execute_blender_code | 208 | 230 | yes |
| disable_telemetry | 135 | 162 | no |
| **Total** | **4,432** | **4,460** (includes 107 fixed for `execute_code`) | |

The biggest single definition is 755 tokens, 17% of the direct total.

> **Important: these two totals are what each side _tries_ to send, not what the model receives.** The codemode total is about the same size as the direct total because the generated TypeScript API carries the same information as the tool schemas. In Claude Code, though, an MCP tool description is cut at about 2,048 characters. Asking the model to quote its `execute_code` description (Blender) returned about 2,070 characters ending in "… [truncated]", and the first-turn context of codemode runs stays near 1.7k tokens for both Blender and Windows regardless of API size. The generated API lists the types first and the callable `codemode.*` members last, so the model sees the types of the first few tools and never the member list. Token savings measured by the model-driven benchmarks therefore include an unknown share that is **missing information**, not compression. Treat those savings as an upper bound until the description is restructured to fit the cap.

## Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| get_addon_status | 474 | 479 | 486 | 494 | +12 ms | 1,096 | 1,264 | 0/0 |
| get_scene_info | 44 | 52 | 64 | 75 | +20 ms | 193 | 222 | 0/0 |
| execute_blender_code | 45 | 52 | 62 | 73 | +17 ms | 45 | 72 | 0/0 |
| look | 197 | 207 | 253 | 256 | +57 ms | 411,191 | 411,319 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 10 ms, p95 19 ms. This is the floor of codemode's per-call overhead.

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
