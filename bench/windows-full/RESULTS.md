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
| files | 3/3 / 3/3 | 16,768 | 6,595 | **-61%** | 13.9s | 14.9s | **8%** | $0.011 | $0.015 |
| inventory | 3/3 / 3/3 | 25,787 | 15,620 | **-39%** | 15.7s | 18.8s | **20%** | $0.021 | $0.034 |
| organize | 3/3 / 3/3 | 26,127 | 7,907 | **-70%** | 15.9s | 15.8s | **-1%** | $0.022 | $0.018 |

Token change ranges from **-70%** (organize) to **-39%** (inventory).

### Task: files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,837 | 332 | 258 | 16,178 | 16,768 | $0.011 | 13.9s |
| codemode | 3/3 | 2.7 | 1.7 | 1,797 | 512 | 965 | 5,119 | 6,595 | $0.015 | 14.9s |

### Task: inventory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,852 | 437 | 1,261 | 24,089 | 25,787 | $0.021 | 15.7s |
| codemode | 3/3 | 5.0 | 4.0 | 1,812 | 904 | 2,742 | 11,974 | 15,620 | $0.034 | 18.8s |

### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,810 | 432 | 1,453 | 24,242 | 26,127 | $0.022 | 15.9s |
| codemode | 3/3 | 3.0 | 2.0 | 1,770 | 517 | 1,343 | 6,047 | 7,907 | $0.018 | 15.8s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.7 | 1.7 | 7,833 | 401 | 991 | 21,503 | 22,894 | $0.018 | 15.2s |
| codemode | 9/9 | 3.6 | 2.6 | 1,793 | 644 | 1,683 | 7,713 | 10,041 | $0.022 | 16.5s |

Total tokens, codemode vs direct: **-56%** (10,041 vs 22,894).

Wall time, codemode vs direct: **9%** (16.5s vs 15.2s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths.

- **files**: Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 30 files of several types. Write C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows\logs.csv containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.
