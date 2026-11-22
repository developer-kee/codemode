# Benchmark: Windows (Windows-MCP), direct MCP vs codemode

- Pass/fail comes from inspecting the files left in the sandbox folder, not from the model's claim.
- Windows-MCP sends its own anonymous telemetry on both paths; it was left on to keep the paths identical.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `scenarios-4-tools`, `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** Gives the model real PowerShell and file access to this PC. Tasks are written to stay inside C:\Users\KEE-YA~1\AppData\Local\Temp\codemode-bench-windows, which is deleted and recreated before every run, but a model can still run arbitrary commands. Run on a machine you are happy to do that on. The `scenarios` and `calls` variants expose every tool, including screenshots and input: see their warning.

## Models

Detailed results below are grouped by model family. Each family is produced by one runner and uses the same tasks and prompts; token counts are comparable within a family, not necessarily across runners, because each harness sends its own system prompt and tool guidance.

| Model | Provider | Runner | Runs | Variants |
|---|---|---|---|---|
| `claude-sonnet-5-5` | Claude | `claude` | 78 | `scenarios`, `scenarios-4-tools`, `calls` |

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
| files | 3/3 / 3/3 | 16,762 | 4,502 | **-73%** | 14.2s | 14.0s | **-1%** | $0.029 | $0.015 |
| inventory | 3/3 / 3/3 | 25,704 | 10,900 | **-58%** | 14.8s | 15.3s | **3%** | $0.021 | $0.030 |
| organize | 3/3 / 3/3 | 26,115 | 8,900 | **-66%** | 15.3s | 15.9s | **4%** | $0.022 | $0.022 |

Token change ranges from **-73%** (files) to **-58%** (inventory).

##### Task: files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,837 | 325 | 3,292 | 13,145 | 16,762 | $0.029 | 14.2s |
| codemode | 3/3 | 2.0 | 1.0 | 1,675 | 404 | 1,309 | 2,788 | 4,502 | $0.015 | 14.0s |

##### Task: inventory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,852 | 439 | 1,262 | 24,002 | 25,704 | $0.021 | 14.8s |
| codemode | 3/3 | 3.0 | 2.0 | 1,690 | 627 | 3,018 | 7,255 | 10,900 | $0.030 | 15.3s |

##### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 7,810 | 430 | 1,402 | 24,282 | 26,115 | $0.022 | 15.3s |
| codemode | 3/3 | 3.0 | 2.0 | 1,648 | 526 | 2,028 | 6,346 | 8,900 | $0.022 | 15.9s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.7 | 1.7 | 7,833 | 398 | 1,985 | 20,476 | 22,860 | $0.024 | 14.8s |
| codemode | 9/9 | 2.7 | 1.7 | 1,671 | 519 | 2,119 | 5,463 | 8,101 | $0.022 | 15.1s |

Total tokens, codemode vs direct: **-65%** (8,101 vs 22,860).

Wall time, codemode vs direct: **2%** (15.1s vs 14.8s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Variant: `scenarios-4-tools`, multi-step scenario tasks, 4 non-visual tools

- Both paths expose the same four upstream tools (FileSystem, PowerShell, Process, Wait), chosen so no run can capture the screen or send input to the desktop. The real server offers 20 tools, so tool-definition overhead is understated compared with a full install (see `scenarios`).

Reproduce: `npm run bench -- --service windows --variant scenarios-4-tools --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| files | 3/3 / 3/3 | 5,622 | 3,943 | **-30%** | 27.9s | 13.6s | **-51%** | $0.015 | $0.014 |
| inventory | 3/3 / 3/3 | 9,330 | 12,647 | **36%** | 17.0s | 18.3s | **7%** | $0.016 | $0.038 |
| organize | 3/3 / 3/3 | 9,487 | 7,019 | **-26%** | 14.0s | 16.1s | **15%** | $0.017 | $0.016 |

Token change ranges from **-30%** (files) to **36%** (inventory).

##### Task: files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 2,274 | 344 | 1,491 | 3,787 | 5,622 | $0.015 | 27.9s |
| codemode | 3/3 | 2.0 | 1.0 | 1,390 | 415 | 1,215 | 2,313 | 3,943 | $0.014 | 13.6s |

##### Task: inventory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 2,289 | 465 | 1,107 | 7,758 | 9,330 | $0.016 | 17.0s |
| codemode | 3/3 | 3.0 | 2.0 | 1,405 | 670 | 4,347 | 7,629 | 12,647 | $0.038 | 18.3s |

##### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 2,247 | 429 | 1,459 | 7,600 | 9,487 | $0.017 | 14.0s |
| codemode | 3/3 | 3.0 | 2.0 | 1,363 | 532 | 1,112 | 5,375 | 7,019 | $0.016 | 16.1s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 9/9 | 2.7 | 1.7 | 2,270 | 413 | 1,352 | 6,381 | 8,146 | $0.016 | 19.6s |
| codemode | 9/9 | 2.7 | 1.7 | 1,386 | 539 | 2,225 | 5,106 | 7,870 | $0.023 | 16.0s |

Total tokens, codemode vs direct: **-3%** (7,870 vs 8,146).

Wall time, codemode vs direct: **-19%** (16.0s vs 19.6s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

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
| PowerShell | 3/3 / 3/3 | 15,679 | 3,474 | **-78%** | 12.2s | 11.9s | **-2%** | $0.007 | $0.005 |
| FileSystem.list | 3/3 / 3/3 | 15,886 | 3,650 | **-77%** | 11.4s | 11.8s | **4%** | $0.008 | $0.006 |
| FileSystem.read | 3/3 / 3/3 | 15,858 | 3,575 | **-77%** | 11.9s | 11.8s | **-1%** | $0.008 | $0.005 |
| FileSystem.write | 3/3 / 3/3 | 16,014 | 3,671 | **-77%** | 12.1s | 11.9s | **-2%** | $0.010 | $0.005 |
| Process.list | 3/3 / 3/3 | 15,875 | 3,556 | **-78%** | 12.1s | 12.5s | **3%** | $0.009 | $0.005 |
| Registry.get | 3/3 / 3/3 | 15,882 | 3,563 | **-78%** | 12.2s | 11.9s | **-2%** | $0.008 | $0.005 |
| Wait | 3/3 / 3/3 | 15,583 | 3,279 | **-79%** | 13.1s | 12.4s | **-6%** | $0.007 | $0.003 |

Token change ranges from **-79%** (Wait) to **-77%** (FileSystem.list).

##### Task: PowerShell

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,716 | 92 | 209 | 15,378 | 15,679 | $0.007 | 12.2s |
| codemode | 3/3 | 2.0 | 1.0 | 1,554 | 145 | 237 | 3,091 | 3,474 | $0.005 | 11.9s |

##### Task: FileSystem.list

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,737 | 140 | 279 | 15,467 | 15,886 | $0.008 | 11.4s |
| codemode | 3/3 | 2.0 | 1.0 | 1,575 | 167 | 435 | 3,048 | 3,650 | $0.006 | 11.8s |

##### Task: FileSystem.read

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,741 | 140 | 254 | 15,464 | 15,858 | $0.008 | 11.9s |
| codemode | 3/3 | 2.0 | 1.0 | 1,579 | 158 | 313 | 3,104 | 3,575 | $0.005 | 11.8s |

##### Task: FileSystem.write

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,756 | 218 | 276 | 15,520 | 16,014 | $0.010 | 12.1s |
| codemode | 3/3 | 2.0 | 1.0 | 1,594 | 205 | 239 | 3,227 | 3,671 | $0.005 | 11.9s |

##### Task: Process.list

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,705 | 150 | 372 | 15,353 | 15,875 | $0.009 | 12.1s |
| codemode | 3/3 | 2.0 | 1.0 | 1,543 | 151 | 340 | 3,065 | 3,556 | $0.005 | 12.5s |

##### Task: Registry.get

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,740 | 151 | 260 | 15,471 | 15,882 | $0.008 | 12.2s |
| codemode | 3/3 | 2.0 | 1.0 | 1,578 | 153 | 310 | 3,100 | 3,563 | $0.005 | 11.9s |

##### Task: Wait

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 7,700 | 58 | 188 | 15,337 | 15,583 | $0.007 | 13.1s |
| codemode | 3/3 | 2.0 | 1.0 | 1,538 | 74 | 176 | 3,029 | 3,279 | $0.003 | 12.4s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 21/21 | 2.0 | 1.0 | 7,728 | 136 | 262 | 15,427 | 15,825 | $0.008 | 12.1s |
| codemode | 21/21 | 2.0 | 1.0 | 1,566 | 150 | 293 | 3,095 | 3,538 | $0.005 | 12.0s |

Total tokens, codemode vs direct: **-78%** (3,538 vs 15,825).

Wall time, codemode vs direct: **-1%** (12.0s vs 12.1s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Per-tool-call benchmark (no model)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../../README.md](../../README.md).

Generated 2026-11-22. 20 upstream tools, 8 cases over 6 tools, 10 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service windows --iters 10`.

### Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| Snapshot | 455 | 31 | 365 | no |
| FileSystem | 399 | 34 | 289 | yes |
| App | 282 | 19 | 178 | no |
| Move | 251 | 13 | 177 | no |
| Screenshot | 236 | 22 | 181 | no |
| Scrape | 231 | 12 | 198 | no |
| Registry | 223 | 12 | 184 | yes |
| Type | 215 | 17 | 150 | no |
| Scroll | 200 | 14 | 152 | no |
| PowerShell | 197 | 8 | 195 | yes |
| WaitFor | 197 | 19 | 151 | no |
| Process | 193 | 14 | 140 | yes |
| Click | 181 | 10 | 142 | no |
| MultiSelect | 159 | 11 | 117 | no |
| Notification | 144 | 10 | 136 | no |
| MultiEdit | 128 | 7 | 98 | no |
| Shortcut | 108 | 6 | 92 | no |
| Clipboard | 106 | 7 | 94 | no |
| Wait | 103 | 5 | 100 | yes |
| DisplayInventory | 73 | 6 | 97 | yes |
| **Total sent every turn** | **4,078** | **495** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 455 tokens, 11% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **1,567 characters** (fits), listing every function at detail level 2 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../../README.md).

### Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| PowerShell | 213 | 238 | 212 | 239 | -1.1 ms | 43 | 72 | 0/0 |
| FileSystem.list | 4.0 | 6.2 | 6.4 | 9.0 | +2.5 ms | 141 | 176 | 0/0 |
| FileSystem.read | 3.9 | 4.3 | 6.2 | 7.9 | +2.2 ms | 90 | 124 | 0/0 |
| FileSystem.write | 4.4 | 5.7 | 6.6 | 8.1 | +2.2 ms | 97 | 130 | 0/0 |
| Process.list | 617 | 645 | 612 | 647 | -5.4 ms | 298 | 331 | 0/0 |
| Registry.get | 230 | 251 | 230 | 265 | -0.1 ms | 99 | 131 | 0/0 |
| Wait | 1003 | 1003 | 1005 | 1005 | +1.9 ms | 21 | 47 | 0/0 |
| DisplayInventory | 1.9 | 2.2 | 2.9 | 3.5 | +1.0 ms | 306 | 549 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 0.7 ms, p95 1.1 ms. This is the floor of codemode's per-call overhead.

### Coverage

Cases cover 6 of 20 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| App | Launches programs and moves windows on your desktop. |
| Snapshot | Captures your screen and UI tree; the image would be sent to the model. |
| Screenshot | Captures your screen; the image would be sent to the model. |
| Click | Sends mouse input to your desktop. |
| Type | Sends keystrokes to your desktop. |
| Scroll | Sends mouse input to your desktop. |
| Move | Moves the mouse on your desktop. |
| Shortcut | Sends key combinations to whatever window has focus. |
| MultiSelect | Sends mouse input to your desktop. |
| MultiEdit | Sends keystrokes to your desktop. |
| Clipboard | Reads your clipboard, which can hold private data. |
| Notification | Pops a visible toast notification on your desktop. |
| Scrape | Fetches an external web page; latency depends on the network, not on the tool. |
| WaitFor | Needs a live UI condition to wait on. |

### Cases

| Case | Arguments | Model prompt |
|---|---|---|
| PowerShell | `{"command":"Write-Output codemode-ok-4821"}` | yes |
| FileSystem.list | `{"mode":"list","path":"<path>"}` | yes |
| FileSystem.read | `{"mode":"read","path":"<path>"}` | yes |
| FileSystem.write | `{"mode":"write","path":"<path>","content":"written-4821","overwrite":true}` | yes |
| Process.list | `{"mode":"list","sort_by":"memory","limit":5}` | yes |
| Registry.get | `{"mode":"get","path":"HKL<path> NT\\CurrentVersion","name":"ProductName"}` | yes |
| Wait | `{"duration":1}` | yes |
| DisplayInventory | `{}` | latency only |

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `scenarios`

- **files**: Work only inside <path>. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside <path>, which holds 30 files of several types. Write <path> containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside <path>, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.

### `scenarios-4-tools`

- **files**: Work only inside <path>. Create the folder report\2026 there. Inside it create four text files Q1.txt, Q2.txt, Q3.txt and Q4.txt, where each file contains exactly the text "Quarter N" with N being its quarter number (1 to 4). Also create report\README.txt containing the four file names, one per line, in order. Then reply with one short sentence.
- **inventory** (pre-seeded): Work only inside <path>, which holds 30 files of several types. Write <path> containing a header line "name,bytes" followed by one line per .log file (name and its size in bytes), sorted by size, largest first, ties by name A to Z. Reply with one short sentence giving the total size in bytes of all the .log files.
- **organize** (pre-seeded): Work only inside <path>, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.

### `calls`

- **PowerShell** (pre-seeded): Run a PowerShell command that prints codemode-ok-4821 and tell me exactly what it printed.
- **FileSystem.list** (pre-seeded): List the files in <path> and reply with their names in one short sentence.
- **FileSystem.read** (pre-seeded): Read the file <path> and tell me exactly what it contains.
- **FileSystem.write** (pre-seeded): Write the text written-4821 to the file <path> (replace it if it exists), then reply with one short sentence.
- **Process.list** (pre-seeded): List the five processes using the most memory right now, names only, in one short sentence.
- **Registry.get** (pre-seeded): Read the ProductName value of the registry key HKL<path> NT\CurrentVersion and tell me it in one short sentence.
- **Wait** (pre-seeded): Wait for 1 second, then reply with the single word done.
