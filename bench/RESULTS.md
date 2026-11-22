# Benchmarks by tool

Each tool is benchmarked separately: the same model, prompts and checks on two paths, the upstream MCP server used directly versus the same server behind codemode (`execute_code`).
Method, metric definitions and limitations: [README.md](README.md). Per-tool detail and raw runs are linked below.

| Tool | Model | Runs (pass) | Total tokens: direct | codemode | Change | Wall time: direct | codemode | Change | Detail |
|---|---|---|---|---|---|---|---|---|---|
| Blender | `claude-sonnet-5-5` | 24 (24) | 28,727 | 8,024 | **-72%** | 11.0s | 11.2s | **1%** | [blender/RESULTS.md](blender/RESULTS.md) |
| Windows (Windows-MCP) | `claude-sonnet-5-5` | 18 (18) | 8,128 | 8,754 | **8%** | 13.3s | 18.0s | **36%** | [windows/RESULTS.md](windows/RESULTS.md) |
| Windows (Windows-MCP), all 20 tools | `claude-sonnet-5-5` | 18 (18) | 22,892 | 8,444 | **-63%** | 14.5s | 15.0s | **3%** | [windows-full/RESULTS.md](windows-full/RESULTS.md) |
| Blender, one tool call per task | `claude-sonnet-5-5` | 18 (18) | 17,476 | 3,063 | **-82%** | 6.8s | 6.8s | **1%** | [blender-calls/RESULTS.md](blender-calls/RESULTS.md) |
| Windows (Windows-MCP, all tools), one tool call per task | `claude-sonnet-5-5` | 42 (42) | 15,827 | 3,498 | **-78%** | 9.9s | 10.5s | **5%** | [windows-calls/RESULTS.md](windows-calls/RESULTS.md) |

Figures are means across all tasks and runs for that tool. Small differences, especially in wall time, are within noise at this sample size. Tools are not comparable with each other: tasks and tool counts differ.
