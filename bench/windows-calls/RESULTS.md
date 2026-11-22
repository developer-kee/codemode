# Benchmark: Windows (Windows-MCP, all tools), one tool call per task, direct MCP vs codemode

- Each task asks for exactly one upstream tool call (7 of 8 cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.
- Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.
- Same tasks, prompts and checks as the 4-tool Windows benchmark; the only change is that both paths expose all 20 Windows-MCP tools.
- Pass/fail comes from inspecting the files left in the sandbox folder, not from the model's claim.
- Check `toolNames` in the raw runs: any call to a screen or input tool means the model went beyond what the task needs.
- Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Reproduce: `npm run bench -- --service windows-calls --runs 3`. Method, metric definitions and limitations: [../README.md](../README.md).

> **Warning:** Gives the model EVERY Windows-MCP tool: PowerShell, files, processes, registry, screenshots of your desktop (sent to the model API), and mouse and keyboard input. The tasks only need files, and the prompt says to stay inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows (wiped before every run), but nothing stops the model using the other tools. Do not run this with anything sensitive on screen or open.

## Model: `claude-sonnet-5-5`

### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| PowerShell | 3/3 / 3/3 | 15,678 | 3,451 | **-78%** | 10.6s | 10.6s | **1%** | $0.006 | $0.007 |
| FileSystem.list | 3/3 / 3/3 | 15,886 | 3,617 | **-77%** | 9.4s | 9.8s | **4%** | $0.007 | $0.005 |
| FileSystem.read | 3/3 / 3/3 | 15,858 | 3,523 | **-78%** | 9.5s | 10.1s | **7%** | $0.007 | $0.005 |
| FileSystem.write | 3/3 / 3/3 | 16,028 | 3,609 | **-77%** | 9.7s | 10.4s | **7%** | $0.008 | $0.005 |
| Process.list | 3/3 / 3/3 | 15,874 | 3,525 | **-78%** | 10.3s | 11.2s | **8%** | $0.008 | $0.005 |
| Registry.get | 3/3 / 3/3 | 15,882 | 3,512 | **-78%** | 10.5s | 10.5s | **-0%** | $0.007 | $0.004 |
| Wait | 3/3 / 3/3 | 15,584 | 3,249 | **-79%** | 9.7s | 10.6s | **9%** | $0.006 | $0.003 |

Token change ranges from **-79%** (Wait) to **-77%** (FileSystem.list).

### Task: PowerShell

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,716 | 92 | 31 | 15,555 | 15,678 | $0.006 | 10.6s |
| codemode | 3/3 | 2.0 | 1.0 | 1,535 | 144 | 713 | 2,594 | 3,451 | $0.007 | 10.6s |

### Task: FileSystem.list

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,737 | 140 | 56 | 15,690 | 15,886 | $0.007 | 9.4s |
| codemode | 3/3 | 2.0 | 1.0 | 1,556 | 170 | 339 | 3,109 | 3,617 | $0.005 | 9.8s |

### Task: FileSystem.read

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,741 | 140 | 42 | 15,676 | 15,858 | $0.007 | 9.5s |
| codemode | 3/3 | 2.0 | 1.0 | 1,560 | 150 | 312 | 3,062 | 3,523 | $0.005 | 10.1s |

### Task: FileSystem.write

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,756 | 231 | 43 | 15,754 | 16,028 | $0.008 | 9.7s |
| codemode | 3/3 | 2.0 | 1.0 | 1,575 | 188 | 239 | 3,182 | 3,609 | $0.005 | 10.4s |

### Task: Process.list

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,705 | 149 | 215 | 15,509 | 15,874 | $0.008 | 10.3s |
| codemode | 3/3 | 2.0 | 1.0 | 1,524 | 159 | 338 | 3,029 | 3,525 | $0.005 | 11.2s |

### Task: Registry.get

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,740 | 150 | 43 | 15,689 | 15,882 | $0.007 | 10.5s |
| codemode | 3/3 | 2.0 | 1.0 | 1,559 | 145 | 226 | 3,140 | 3,512 | $0.004 | 10.5s |

### Task: Wait

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,700 | 58 | 27 | 15,499 | 15,584 | $0.006 | 9.7s |
| codemode | 3/3 | 2.0 | 1.0 | 1,519 | 78 | 197 | 2,974 | 3,249 | $0.003 | 10.6s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 21/21 | 2.0 | 1.0 | 7,728 | 137 | 65 | 15,625 | 15,827 | $0.007 | 9.9s |
| codemode | 21/21 | 2.0 | 1.0 | 1,547 | 148 | 338 | 3,013 | 3,498 | $0.005 | 10.5s |

Total tokens, codemode vs direct: **-78%** (3,498 vs 15,827).

Wall time, codemode vs direct: **5%** (10.5s vs 9.9s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths.

- **PowerShell** (pre-seeded): Run a PowerShell command that prints codemode-ok-4821 and tell me exactly what it printed.
- **FileSystem.list** (pre-seeded): List the files in C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls and reply with their names in one short sentence.
- **FileSystem.read** (pre-seeded): Read the file C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls\a.txt and tell me exactly what it contains.
- **FileSystem.write** (pre-seeded): Write the text written-4821 to the file C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls\out.txt (replace it if it exists), then reply with one short sentence.
- **Process.list** (pre-seeded): List the five processes using the most memory right now, names only, in one short sentence.
- **Registry.get** (pre-seeded): Read the ProductName value of the registry key HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion and tell me it in one short sentence.
- **Wait** (pre-seeded): Wait for 1 second, then reply with the single word done.
