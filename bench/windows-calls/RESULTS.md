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
| PowerShell | 1/1 / 1/1 | 15,681 | 8,429 | **-46%** | 9.9s | 13.3s | **34%** | $0.009 | $0.021 |
| FileSystem.list | 1/1 / 1/1 | 15,886 | 8,796 | **-45%** | 8.9s | 12.3s | **38%** | $0.011 | $0.015 |
| FileSystem.read | 1/1 / 1/1 | 15,858 | 3,837 | **-76%** | 9.3s | 9.6s | **3%** | $0.010 | $0.007 |
| FileSystem.write | 1/1 / 1/1 | 16,009 | 8,947 | **-44%** | 10.1s | 12.9s | **27%** | $0.012 | $0.016 |
| Process.list | 1/1 / 1/1 | 15,878 | 3,801 | **-76%** | 10.0s | 11.0s | **10%** | $0.011 | $0.007 |
| Registry.get | 1/1 / 1/1 | 15,880 | 3,785 | **-76%** | 11.5s | 10.6s | **-7%** | $0.011 | $0.006 |
| Wait | 1/1 / 1/1 | 15,580 | 13,926 | **-11%** | 9.7s | 15.1s | **55%** | $0.008 | $0.019 |

Token change ranges from **-76%** (Registry.get) to **-11%** (Wait).

### Task: PowerShell

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 7,716 | 92 | 537 | 15,052 | 15,681 | $0.009 | 9.9s |
| codemode | 1/1 | 4.0 | 3.0 | 1,677 | 334 | 2,370 | 5,725 | 8,429 | $0.021 | 13.3s |

### Task: FileSystem.list

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 7,737 | 140 | 673 | 15,073 | 15,886 | $0.011 | 8.9s |
| codemode | 1/1 | 4.0 | 3.0 | 1,698 | 383 | 1,136 | 7,277 | 8,796 | $0.015 | 12.3s |

### Task: FileSystem.read

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 7,741 | 140 | 641 | 15,077 | 15,858 | $0.010 | 9.3s |
| codemode | 1/1 | 2.0 | 1.0 | 1,702 | 167 | 568 | 3,102 | 3,837 | $0.007 | 9.6s |

### Task: FileSystem.write

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 7,756 | 215 | 702 | 15,092 | 16,009 | $0.012 | 10.1s |
| codemode | 1/1 | 4.0 | 3.0 | 1,717 | 436 | 1,155 | 7,356 | 8,947 | $0.016 | 12.9s |

### Task: Process.list

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 7,705 | 151 | 686 | 15,041 | 15,878 | $0.011 | 10.0s |
| codemode | 1/1 | 2.0 | 1.0 | 1,666 | 206 | 529 | 3,066 | 3,801 | $0.007 | 11.0s |

### Task: Registry.get

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 7,740 | 151 | 653 | 15,076 | 15,880 | $0.011 | 11.5s |
| codemode | 1/1 | 2.0 | 1.0 | 1,701 | 159 | 525 | 3,101 | 3,785 | $0.006 | 10.6s |

### Task: Wait

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 1/1 | 2.0 | 1.0 | 7,700 | 58 | 486 | 15,036 | 15,580 | $0.008 | 9.7s |
| codemode | 1/1 | 6.0 | 5.0 | 1,661 | 429 | 1,450 | 12,047 | 13,926 | $0.019 | 15.1s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 7/7 | 2.0 | 1.0 | 7,728 | 135 | 625 | 15,064 | 15,825 | $0.010 | 9.9s |
| codemode | 7/7 | 3.4 | 2.4 | 1,689 | 302 | 1,105 | 5,953 | 7,360 | $0.013 | 12.1s |

Total tokens, codemode vs direct: **-53%** (7,360 vs 15,825).

Wall time, codemode vs direct: **22%** (12.1s vs 9.9s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths.

- **PowerShell** (pre-seeded): Run a PowerShell command that prints codemode-ok-4821 and tell me exactly what it printed.
- **FileSystem.list** (pre-seeded): List the files in C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls and reply with their names in one short sentence.
- **FileSystem.read** (pre-seeded): Read the file C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls\a.txt and tell me exactly what it contains.
- **FileSystem.write** (pre-seeded): Write the text written-4821 to the file C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls\out.txt (replace it if it exists), then reply with one short sentence.
- **Process.list** (pre-seeded): List the five processes using the most memory right now, names only, in one short sentence.
- **Registry.get** (pre-seeded): Read the ProductName value of the registry key HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion and tell me it in one short sentence.
- **Wait** (pre-seeded): Wait for 1 second, then reply with the single word done.
