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
| files | 3/3 / 3/3 | 5,592 | 11,647 | **108%** | 11.3s | 24.8s | **120%** | $0.007 | $0.029 |
| inventory | 3/3 / 3/3 | 9,338 | 7,662 | **-18%** | 14.8s | 13.8s | **-7%** | $0.012 | $0.022 |
| organize | 3/3 / 3/3 | 9,455 | 6,953 | **-26%** | 13.7s | 15.5s | **13%** | $0.012 | $0.019 |

Token change ranges from **-26%** (organize) to **108%** (files).

### Task: files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 2,274 | 330 | 4 | 5,258 | 5,592 | $0.007 | 11.3s |
| codemode | 3/3 | 4.7 | 3.7 | 1,365 | 968 | 1,992 | 8,687 | 11,647 | $0.029 | 24.8s |

### Task: inventory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 2,289 | 468 | 421 | 8,449 | 9,338 | $0.012 | 14.8s |
| codemode | 3/3 | 3.0 | 2.0 | 1,380 | 634 | 1,824 | 5,203 | 7,662 | $0.022 | 13.8s |

### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 2,247 | 425 | 468 | 8,562 | 9,455 | $0.012 | 13.7s |
| codemode | 3/3 | 3.0 | 2.0 | 1,338 | 532 | 1,517 | 4,904 | 6,953 | $0.019 | 15.5s |

### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.7 | 1.7 | 2,270 | 408 | 298 | 7,423 | 8,128 | $0.010 | 13.3s |
| codemode | 9/9 | 3.6 | 2.6 | 1,361 | 711 | 1,778 | 6,265 | 8,754 | $0.023 | 18.0s |

Total tokens, codemode vs direct: **8%** (8,754 vs 8,128).

Wall time, codemode vs direct: **36%** (18.0s vs 13.3s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths.

- **files**: Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 30 files of several types. Write C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows\logs.csv containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.
