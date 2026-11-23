# Benchmark: SolidCraft (parametric CAD, read-only tools), direct MCP vs codemode

- The install is local software: the version in the results (`version`) is whatever is on the machine that ran it.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** Starts `solidcraft-cli mcp --headless` (an empty session of its own, never the open app) and calls only read-only tools (version, listing, describing, inspecting, measuring). It writes nothing.

## TL;DR

Codemode compared with the same server used directly. Left number is codemode, right is direct.

- **Model runs:** none recorded yet.
- **Tool definitions sent every turn:** 479 vs 8,344 tokens (-94%), 23 tools.
- **Latency of one call (no model):** median overhead +2 ms across 9 cases.
- **Verdict (`calls`):** Tool definitions shrink by 94%, but no model runs are recorded, so the effect on tokens, time and correctness is not measured.

_No runs recorded yet._

## Per-tool-call benchmark (no model)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../../README.md](../../README.md).

Generated 2026-11-23. 23 upstream tools, 9 cases over 9 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service solidcraft --iters 10`.

### Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| batch | 1,249 | 25 | 1,138 | no |
| execute | 985 | 12 | 905 | no |
| open | 604 | 10 | 567 | no |
| export | 596 | 27 | 545 | no |
| compare_picture | 591 | 24 | 529 | no |
| screenshot | 543 | 19 | 502 | no |
| inspect_design | 497 | 17 | 458 | yes |
| check_parameters | 474 | 13 | 426 | no |
| list_commands | 447 | 20 | 402 | yes |
| measure | 361 | 12 | 331 | yes |
| save | 290 | 9 | 269 | no |
| set_parameter | 282 | 15 | 243 | no |
| body_topology | 281 | 8 | 261 | no |
| crash_reports | 191 | 8 | 180 | yes |
| cancel | 175 | 3 | 170 | no |
| skill_reference | 153 | 8 | 132 | yes |
| running | 138 | 3 | 134 | yes |
| pending | 131 | 3 | 126 | yes |
| describe_command | 117 | 6 | 107 | yes |
| version | 106 | 3 | 101 | yes |
| new_design | 66 | 5 | 59 | no |
| undo | 36 | 3 | 30 | no |
| redo | 35 | 3 | 29 | no |
| **Total sent every turn** | **8,344** | **479** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 1,249 tokens, 15% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **1,500 characters** (fits), listing every function at detail level 2 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../../README.md).

### Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| version | 0.9 | 1.3 | 3.9 | 6.8 | +3.0 ms | 103 | 111 | 0/0 |
| list_commands | 3.9 | 4.8 | 7.5 | 9.4 | +3.6 ms | 5,558 | 5,566 | 0/0 |
| describe_command | 1.2 | 1.9 | 4.8 | 5.8 | +3.6 ms | 10,064 | 10,068 | 0/0 |
| skill_reference | 0.9 | 0.9 | 3.5 | 4.4 | +2.7 ms | 17,044 | 17,052 | 0/0 |
| inspect_design | 0.9 | 0.9 | 2.6 | 3.3 | +1.8 ms | 286 | 294 | 0/0 |
| measure | 0.8 | 1.3 | 2.6 | 5.4 | +1.8 ms | 201 | 200 | 0/0 |
| running | 0.7 | 0.9 | 2.5 | 3.1 | +1.8 ms | 19 | 27 | 0/0 |
| pending | 0.5 | 0.7 | 2.2 | 2.6 | +1.7 ms | 53 | 61 | 0/0 |
| crash_reports | 0.8 | 1.0 | 3.0 | 3.5 | +2.2 ms | 90 | 98 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 1.1 ms, p95 1.5 ms. This is the floor of codemode's per-call overhead.

### Coverage

Cases cover 9 of 23 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| execute | Changes the design, files or the running app, so it is not timed against a live install. |
| batch | Changes the design, files or the running app, so it is not timed against a live install. |
| set_parameter | Changes the design, files or the running app, so it is not timed against a live install. |
| check_parameters | Changes the design, files or the running app, so it is not timed against a live install. |
| new_design | Changes the design, files or the running app, so it is not timed against a live install. |
| open | Changes the design, files or the running app, so it is not timed against a live install. |
| save | Changes the design, files or the running app, so it is not timed against a live install. |
| export | Changes the design, files or the running app, so it is not timed against a live install. |
| undo | Changes the design, files or the running app, so it is not timed against a live install. |
| redo | Changes the design, files or the running app, so it is not timed against a live install. |
| cancel | Changes the design, files or the running app, so it is not timed against a live install. |
| body_topology | Needs a body id from a design that has one; the benchmark session is empty. |
| screenshot | Returns an image, which a script cannot show the model; left out of the code API. |
| compare_picture | Takes and returns images; left out of the code API. |

### Cases

| Case | Arguments | Model prompt |
|---|---|---|
| version | `{}` | latency only |
| list_commands | `{"filter":"fillet","limit":5}` | latency only |
| describe_command | `{"id":"solid.box"}` | latency only |
| skill_reference | `{"skill":"solidcraft-modeling"}` | latency only |
| inspect_design | `{"measure":false,"sketches":false}` | latency only |
| measure | `{}` | latency only |
| running | `{}` | latency only |
| pending | `{}` | latency only |
| crash_reports | `{"limit":3}` | latency only |

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `calls`

