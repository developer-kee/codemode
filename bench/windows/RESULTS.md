# Benchmark: Windows (Windows-MCP), direct MCP vs codemode

- Both paths expose the same four upstream tools (FileSystem, PowerShell, Process, Wait), chosen so no run can capture the screen or send input to the desktop. The real server offers 20 tools, so tool-definition overhead is understated compared with a full install.
- Pass/fail comes from inspecting the files left in the sandbox folder, not from the model's claim.
- Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Reproduce: `npm run bench -- --service windows --runs 3`. Method, metric definitions and limitations: [../README.md](../README.md).

> **Warning:** Gives the model real PowerShell and file access to this PC. Tasks are written to stay inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which is deleted and recreated before every run, but a model can still run arbitrary commands. Run on a machine you are happy to do that on.

## Model: `claude-sonnet-5-5`

### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| files | 3/3 / 3/3 | 5,638 | 4,407 | **-22%** | 13.6s | 14.0s | **3%** | $0.011 | $0.010 |
| inventory | 3/3 / 3/3 | 9,334 | 9,633 | **3%** | 16.2s | 17.1s | **5%** | $0.016 | $0.020 |
| organize | 3/3 / 3/3 | 9,426 | 7,593 | **-19%** | 14.7s | 18.8s | **28%** | $0.015 | $0.017 |

Token change ranges from **-22%** (files) to **3%** (inventory).

### Task: files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 2,274 | 346 | 660 | 4,632 | 5,638 | $0.011 | 13.6s |
| codemode | 3/3 | 2.0 | 1.0 | 1,663 | 398 | 583 | 3,427 | 4,407 | $0.010 | 14.0s |

### Task: inventory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 2,289 | 463 | 1,113 | 7,758 | 9,334 | $0.016 | 16.2s |
| codemode | 3/3 | 3.0 | 2.0 | 1,678 | 548 | 1,635 | 7,450 | 9,633 | $0.020 | 17.1s |

### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 2,247 | 399 | 1,103 | 7,924 | 9,426 | $0.015 | 14.7s |
| codemode | 3/3 | 3.0 | 2.0 | 1,636 | 520 | 1,327 | 5,746 | 7,593 | $0.017 | 18.8s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.7 | 1.7 | 2,270 | 403 | 958 | 6,771 | 8,133 | $0.014 | 14.8s |
| codemode | 9/9 | 2.7 | 1.7 | 1,659 | 489 | 1,181 | 5,541 | 7,211 | $0.016 | 16.6s |

Total tokens, codemode vs direct: **-11%** (7,211 vs 8,133).

Wall time, codemode vs direct: **12%** (16.6s vs 14.8s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths.

- **files**: Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 30 files of several types. Write C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows\logs.csv containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.
