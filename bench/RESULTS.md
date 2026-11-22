# Benchmarks by tool

Each tool is benchmarked separately: the same model, prompts and checks on two paths, the upstream MCP server used directly versus the same server behind codemode (`execute_code`).
Method, metric definitions and limitations: [README.md](README.md). Per-tool detail and raw runs are linked below.

| Tool | Model | Runs (pass) | Total tokens: direct | codemode | Change | Wall time: direct | codemode | Change | Detail |
|---|---|---|---|---|---|---|---|---|---|
| Blender | `claude-sonnet-5-5` | 24 (24) | 29,760 | 7,879 | **-74%** | 12.0s | 11.1s | **-7%** | [blender/RESULTS.md](blender/RESULTS.md) |
| Windows (Windows-MCP) | `claude-sonnet-5-5` | 18 (18) | 8,133 | 7,211 | **-11%** | 14.8s | 16.6s | **12%** | [windows/RESULTS.md](windows/RESULTS.md) |
| Windows (Windows-MCP), all 20 tools | `claude-sonnet-5-5` | 18 (18) | 22,894 | 10,041 | **-56%** | 15.2s | 16.5s | **9%** | [windows-full/RESULTS.md](windows-full/RESULTS.md) |
| Blender, one tool call per task | `claude-sonnet-5-5` | 6 (6) | 17,476 | 3,502 | **-80%** | 6.9s | 6.9s | **-0%** | [blender-calls/RESULTS.md](blender-calls/RESULTS.md) |
| Windows (Windows-MCP, all tools), one tool call per task | `claude-sonnet-5-5` | 14 (14) | 15,825 | 7,360 | **-53%** | 9.9s | 12.1s | **22%** | [windows-calls/RESULTS.md](windows-calls/RESULTS.md) |

Figures are means across all tasks and runs for that tool. Small differences, especially in wall time, are within noise at this sample size. Tools are not comparable with each other: tasks and tool counts differ.
