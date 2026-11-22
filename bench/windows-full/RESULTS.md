# Benchmark: Windows (Windows-MCP), all 20 tools, direct MCP vs codemode

- Same tasks, prompts and checks as the 4-tool Windows benchmark; the only change is that both paths expose all 20 Windows-MCP tools.
- Pass/fail comes from inspecting the files left in the sandbox folder, not from the model's claim.
- Check `toolNames` in the raw runs: any call to a screen or input tool means the model went beyond what the task needs.
- Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Reproduce: `npm run bench -- --service windows-full --runs 3`. Method, metric definitions and limitations: [../README.md](../README.md).

> **Warning:** Gives the model EVERY Windows-MCP tool: PowerShell, files, processes, registry, screenshots of your desktop (sent to the model API), and mouse and keyboard input. The tasks only need files, and the prompt says to stay inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows (wiped before every run), but nothing stops the model using the other tools. Do not run this with anything sensitive on screen or open.

## Model: `claude-sonnet-5-5`

### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| files | 3/3 / 3/3 | 16,785 | 4,491 | **-73%** | 13.1s | 13.0s | **-1%** | $0.011 | $0.015 |
| inventory | 3/3 / 3/3 | 25,670 | 13,058 | **-49%** | 15.1s | 16.2s | **7%** | $0.019 | $0.038 |
| organize | 3/3 / 3/3 | 26,220 | 7,783 | **-70%** | 15.4s | 16.0s | **4%** | $0.019 | $0.018 |

Token change ranges from **-73%** (files) to **-49%** (inventory).

### Task: files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,837 | 351 | 172 | 16,262 | 16,785 | $0.011 | 13.1s |
| codemode | 3/3 | 2.0 | 1.0 | 1,654 | 408 | 1,330 | 2,753 | 4,491 | $0.015 | 13.0s |

### Task: inventory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,852 | 425 | 874 | 24,372 | 25,670 | $0.019 | 15.1s |
| codemode | 3/3 | 3.0 | 2.0 | 1,669 | 701 | 4,140 | 8,217 | 13,058 | $0.038 | 16.2s |

### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,810 | 438 | 889 | 24,893 | 26,220 | $0.019 | 15.4s |
| codemode | 3/3 | 3.0 | 2.0 | 1,627 | 518 | 1,500 | 5,765 | 7,783 | $0.018 | 16.0s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.7 | 1.7 | 7,833 | 404 | 645 | 21,842 | 22,892 | $0.016 | 14.5s |
| codemode | 9/9 | 2.7 | 1.7 | 1,650 | 542 | 2,323 | 5,578 | 8,444 | $0.024 | 15.0s |

Total tokens, codemode vs direct: **-63%** (8,444 vs 22,892).

Wall time, codemode vs direct: **3%** (15.0s vs 14.5s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths.

- **files**: Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 30 files of several types. Write C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows\logs.csv containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.
