# Benchmark: direct blender-mcp vs codemode

Both paths drive the same live Blender through the same upstream (`blender-mcp`), with the same model, the same prompt, built-in tools disabled, and the scene reset before every run.
Numbers are means over runs. `Pass` is an objective check of the resulting scene (positions, sizes, names, materials), not the model's own claim.
Reproduce: `npm run bench -- --runs 3`.

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

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 3.0 | 2.0 | 8,586 | 627 | 742 | 26,854 | 28,223 | $0.022 | 11.4s |
| codemode | 9/9 | 2.4 | 1.4 | 1,692 | 610 | 853 | 4,537 | 5,999 | $0.016 | 10.3s |

Total tokens, codemode vs direct: **-79%** (5,999 vs 28,223).

Wall time, codemode vs direct: **-9%** (10.3s vs 11.4s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and Blender execution.
