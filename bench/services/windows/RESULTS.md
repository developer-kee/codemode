# Benchmark: Windows (Windows-MCP), direct MCP vs codemode

- Pass/fail comes from inspecting the files left in the sandbox folder, not from the model's claim.
- Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `scenarios-4-tools`, `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** Gives the model real PowerShell and file access to this PC. Tasks are written to stay inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which is deleted and recreated before every run, but a model can still run arbitrary commands. Run on a machine you are happy to do that on. The `scenarios` and `calls` variants expose every tool, including screenshots and input: see their warning.

## Models

Runs are grouped by model family, then by model id. Each family is produced by one runner, and every family uses the same tasks and prompts; token counts are comparable within a family, not necessarily across runners, because each harness sends its own system prompt and tool guidance.

### Claude

Runner: `claude`.

- `claude-sonnet-5-5`: 78 runs in `scenarios`, `scenarios-4-tools`, `calls`

## Variant: `scenarios`, multi-step scenario tasks, all 20 tools

- Both paths expose all 20 Windows-MCP tools, as a normal install does, so tool-definition overhead is realistic.
- Check `toolNames` in the raw runs: any call to a screen or input tool means the model went beyond what the task needs.

Reproduce: `npm run bench -- --service windows --variant scenarios --runs 3`.

> **Warning:** Gives the model EVERY Windows-MCP tool: PowerShell, files, processes, registry, screenshots of your desktop (sent to the model API), and mouse and keyboard input. The tasks only need files, and the prompt says to stay inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows (wiped before every run), but nothing stops the model using the other tools. Do not run this with anything sensitive on screen or open.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| files | 3/3 / 3/3 | 16,785 | 4,491 | **-73%** | 13.1s | 13.0s | **-1%** | $0.011 | $0.015 |
| inventory | 3/3 / 3/3 | 25,670 | 13,058 | **-49%** | 15.1s | 16.2s | **7%** | $0.019 | $0.038 |
| organize | 3/3 / 3/3 | 26,220 | 7,783 | **-70%** | 15.4s | 16.0s | **4%** | $0.019 | $0.018 |

Token change ranges from **-73%** (files) to **-49%** (inventory).

##### Task: files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,837 | 351 | 172 | 16,262 | 16,785 | $0.011 | 13.1s |
| codemode | 3/3 | 2.0 | 1.0 | 1,654 | 408 | 1,330 | 2,753 | 4,491 | $0.015 | 13.0s |

##### Task: inventory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,852 | 425 | 874 | 24,372 | 25,670 | $0.019 | 15.1s |
| codemode | 3/3 | 3.0 | 2.0 | 1,669 | 701 | 4,140 | 8,217 | 13,058 | $0.038 | 16.2s |

##### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,810 | 438 | 889 | 24,893 | 26,220 | $0.019 | 15.4s |
| codemode | 3/3 | 3.0 | 2.0 | 1,627 | 518 | 1,500 | 5,765 | 7,783 | $0.018 | 16.0s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.7 | 1.7 | 7,833 | 404 | 645 | 21,842 | 22,892 | $0.016 | 14.5s |
| codemode | 9/9 | 2.7 | 1.7 | 1,650 | 542 | 2,323 | 5,578 | 8,444 | $0.024 | 15.0s |

Total tokens, codemode vs direct: **-63%** (8,444 vs 22,892).

Wall time, codemode vs direct: **3%** (15.0s vs 14.5s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Variant: `scenarios-4-tools`, multi-step scenario tasks, 4 non-visual tools

- Both paths expose the same four upstream tools (FileSystem, PowerShell, Process, Wait), chosen so no run can capture the screen or send input to the desktop. The real server offers 20 tools, so tool-definition overhead is understated compared with a full install (see `scenarios`).

Reproduce: `npm run bench -- --service windows --variant scenarios-4-tools --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| files | 3/3 / 3/3 | 5,592 | 11,647 | **108%** | 11.3s | 24.8s | **120%** | $0.007 | $0.029 |
| inventory | 3/3 / 3/3 | 9,338 | 7,662 | **-18%** | 14.8s | 13.8s | **-7%** | $0.012 | $0.022 |
| organize | 3/3 / 3/3 | 9,455 | 6,953 | **-26%** | 13.7s | 15.5s | **13%** | $0.012 | $0.019 |

Token change ranges from **-26%** (organize) to **108%** (files).

##### Task: files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 2,274 | 330 | 4 | 5,258 | 5,592 | $0.007 | 11.3s |
| codemode | 3/3 | 4.7 | 3.7 | 1,365 | 968 | 1,992 | 8,687 | 11,647 | $0.029 | 24.8s |

##### Task: inventory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 2,289 | 468 | 421 | 8,449 | 9,338 | $0.012 | 14.8s |
| codemode | 3/3 | 3.0 | 2.0 | 1,380 | 634 | 1,824 | 5,203 | 7,662 | $0.022 | 13.8s |

##### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 2,247 | 425 | 468 | 8,562 | 9,455 | $0.012 | 13.7s |
| codemode | 3/3 | 3.0 | 2.0 | 1,338 | 532 | 1,517 | 4,904 | 6,953 | $0.019 | 15.5s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.7 | 1.7 | 2,270 | 408 | 298 | 7,423 | 8,128 | $0.010 | 13.3s |
| codemode | 9/9 | 3.6 | 2.6 | 1,361 | 711 | 1,778 | 6,265 | 8,754 | $0.023 | 18.0s |

Total tokens, codemode vs direct: **8%** (8,754 vs 8,128).

Wall time, codemode vs direct: **36%** (18.0s vs 13.3s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Variant: `calls`, one tool call per task

- Each task asks for exactly one upstream tool call (7 of 8 cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.
- Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.
- Both paths expose all 20 Windows-MCP tools, as a normal install does, so tool-definition overhead is realistic.
- Check `toolNames` in the raw runs: any call to a screen or input tool means the model went beyond what the task needs.

Reproduce: `npm run bench -- --service windows --variant calls --runs 3`.

> **Warning:** Gives the model EVERY Windows-MCP tool: PowerShell, files, processes, registry, screenshots of your desktop (sent to the model API), and mouse and keyboard input. The tasks only need files, and the prompt says to stay inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows (wiped before every run), but nothing stops the model using the other tools. Do not run this with anything sensitive on screen or open.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

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

##### Task: PowerShell

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,716 | 92 | 31 | 15,555 | 15,678 | $0.006 | 10.6s |
| codemode | 3/3 | 2.0 | 1.0 | 1,535 | 144 | 713 | 2,594 | 3,451 | $0.007 | 10.6s |

##### Task: FileSystem.list

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,737 | 140 | 56 | 15,690 | 15,886 | $0.007 | 9.4s |
| codemode | 3/3 | 2.0 | 1.0 | 1,556 | 170 | 339 | 3,109 | 3,617 | $0.005 | 9.8s |

##### Task: FileSystem.read

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,741 | 140 | 42 | 15,676 | 15,858 | $0.007 | 9.5s |
| codemode | 3/3 | 2.0 | 1.0 | 1,560 | 150 | 312 | 3,062 | 3,523 | $0.005 | 10.1s |

##### Task: FileSystem.write

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,756 | 231 | 43 | 15,754 | 16,028 | $0.008 | 9.7s |
| codemode | 3/3 | 2.0 | 1.0 | 1,575 | 188 | 239 | 3,182 | 3,609 | $0.005 | 10.4s |

##### Task: Process.list

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,705 | 149 | 215 | 15,509 | 15,874 | $0.008 | 10.3s |
| codemode | 3/3 | 2.0 | 1.0 | 1,524 | 159 | 338 | 3,029 | 3,525 | $0.005 | 11.2s |

##### Task: Registry.get

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,740 | 150 | 43 | 15,689 | 15,882 | $0.007 | 10.5s |
| codemode | 3/3 | 2.0 | 1.0 | 1,559 | 145 | 226 | 3,140 | 3,512 | $0.004 | 10.5s |

##### Task: Wait

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,700 | 58 | 27 | 15,499 | 15,584 | $0.006 | 9.7s |
| codemode | 3/3 | 2.0 | 1.0 | 1,519 | 78 | 197 | 2,974 | 3,249 | $0.003 | 10.6s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 21/21 | 2.0 | 1.0 | 7,728 | 137 | 65 | 15,625 | 15,827 | $0.007 | 9.9s |
| codemode | 21/21 | 2.0 | 1.0 | 1,547 | 148 | 338 | 3,013 | 3,498 | $0.005 | 10.5s |

Total tokens, codemode vs direct: **-78%** (3,498 vs 15,827).

Wall time, codemode vs direct: **5%** (10.5s vs 9.9s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `scenarios`

- **files**: Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 30 files of several types. Write C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows\logs.csv containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.

### `scenarios-4-tools`

- **files**: Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 30 files of several types. Write C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows\logs.csv containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.

### `calls`

- **PowerShell** (pre-seeded): Run a PowerShell command that prints codemode-ok-4821 and tell me exactly what it printed.
- **FileSystem.list** (pre-seeded): List the files in C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls and reply with their names in one short sentence.
- **FileSystem.read** (pre-seeded): Read the file C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls\a.txt and tell me exactly what it contains.
- **FileSystem.write** (pre-seeded): Write the text written-4821 to the file C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows-calls\out.txt (replace it if it exists), then reply with one short sentence.
- **Process.list** (pre-seeded): List the five processes using the most memory right now, names only, in one short sentence.
- **Registry.get** (pre-seeded): Read the ProductName value of the registry key HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion and tell me it in one short sentence.
- **Wait** (pre-seeded): Wait for 1 second, then reply with the single word done.
