# Benchmarks by tool

Each tool is benchmarked separately: the same model, prompts and checks on two paths, the upstream MCP server used directly versus the same server behind codemode (`execute_code`).
Method, metric definitions and limitations: [README.md](README.md). Per-tool detail and raw runs are linked below.

| Tool | Model | Runs (pass) | Total tokens: direct | codemode | Change | Wall time: direct | codemode | Change | Detail |
|---|---|---|---|---|---|---|---|---|---|
| Blender | `claude-sonnet-5-5` | 24 (24) | 29,760 | 7,879 | **-74%** | 12.0s | 11.1s | **-7%** | [blender/RESULTS.md](blender/RESULTS.md) |
| Windows (Windows-MCP) | - | no runs yet | - | - | - | - | - | - | [windows/RESULTS.md](windows/RESULTS.md) |

Figures are means across all tasks and runs for that tool. Small differences, especially in wall time, are within noise at this sample size. Tools are not comparable with each other: tasks and tool counts differ.
