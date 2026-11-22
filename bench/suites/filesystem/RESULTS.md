# Benchmark: Filesystem (reference MCP server), direct MCP vs codemode

- Pass/fail comes from inspecting the files left in the sandbox folder, not from the model's claim.
- Fully local and deterministic: no account, no network beyond installing the server package.

Numbers are means over runs. `Pass` is an objective check of the resulting state, not the model's own claim.
Variants: `scenarios`, `calls`. Method, metric definitions and limitations: [../../README.md](../../README.md).

> **Warning:** Gives the model read and write access to C:\repos\codemode\bench\work\fs-sandbox, which is deleted and recreated before every run, and to nothing else: the server is started with that single allowed directory. Nothing is downloaded except the pinned npm package.

## Models

Detailed results below are grouped by model family. Each family is produced by one runner and uses the same tasks and prompts; token counts are comparable within a family, not necessarily across runners, because each harness sends its own system prompt and tool guidance.

| Model | Provider | Runner | Runs | Variants |
|---|---|---|---|---|
| `claude-sonnet-5-5` | Claude | `claude` | 84 | `scenarios`, `calls` |

## Variant: `scenarios`, multi-step scenario tasks

- Both paths expose all 16 tools of the pinned `@modelcontextprotocol/server-filesystem@2.4.0`. The sandbox sits inside the benchmark's working directory because Claude Code passes that directory to the server as a root, which overrides the server's command-line directories (see `tasks.ts`); the direct path may therefore reach all of `bench/work/`, the codemode path only the sandbox.
- The `log-triage` task is the one built for code mode: 20 log files of 60 lines each must be read and counted, so a model working tool by tool pulls them all into context while a script returns only the counts.

Reproduce: `npm run bench -- --service filesystem --variant scenarios --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| notes-index | 3/3 / 3/3 | 18,568 | 3,520 | **-81%** | 10.6s | 9.6s | **-9%** | $0.020 | $0.009 |
| log-triage | 3/3 / 3/3 | 118,043 | 5,356 | **-95%** | 20.9s | 11.1s | **-47%** | $0.342 | $0.015 |
| organize | 3/3 / 3/3 | 42,423 | 6,232 | **-85%** | 33.5s | 10.3s | **-69%** | $0.168 | $0.013 |
| retries | 3/3 / 3/3 | 33,241 | 9,763 | **-71%** | 16.6s | 12.5s | **-24%** | $0.064 | $0.027 |

Token change ranges from **-95%** (log-triage) to **-71%** (retries).

##### Task: notes-index

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 6.0 | 5.0 | 5,542 | 656 | 861 | 17,051 | 18,568 | $0.020 | 10.6s |
| codemode | 3/3 | 2.0 | 1.0 | 1,365 | 370 | 436 | 2,714 | 3,520 | $0.009 | 9.6s |

##### Task: log-triage

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 5.0 | 4.0 | 5,549 | 2,654 | 46,885 | 68,504 | 118,043 | $0.342 | 20.9s |
| codemode | 3/3 | 2.7 | 1.7 | 1,372 | 592 | 769 | 3,996 | 5,356 | $0.015 | 11.1s |

##### Task: organize

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 47.0 | 46.0 | 5,501 | 6,025 | 11,770 | 24,628 | 42,423 | $0.168 | 33.5s |
| codemode | 3/3 | 3.0 | 2.0 | 1,324 | 448 | 846 | 4,938 | 6,232 | $0.013 | 10.3s |

##### Task: retries

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 9.0 | 8.0 | 5,500 | 1,747 | 5,058 | 26,437 | 33,241 | $0.064 | 16.6s |
| codemode | 3/3 | 4.0 | 3.0 | 1,323 | 755 | 2,258 | 6,750 | 9,763 | $0.027 | 12.5s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 12/12 | 16.8 | 15.8 | 5,523 | 2,771 | 16,143 | 34,155 | 53,069 | $0.149 | 20.4s |
| codemode | 12/12 | 2.9 | 1.9 | 1,346 | 541 | 1,077 | 4,600 | 6,218 | $0.016 | 10.9s |

Total tokens, codemode vs direct: **-88%** (6,218 vs 53,069).

Wall time, codemode vs direct: **-47%** (10.9s vs 20.4s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Variant: `calls`, one tool call per task

- Each task asks for exactly one upstream tool call (10 of 12 cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.
- Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.
- Both paths expose all 16 tools of the pinned `@modelcontextprotocol/server-filesystem@2.4.0`. The sandbox sits inside the benchmark's working directory because Claude Code passes that directory to the server as a root, which overrides the server's command-line directories (see `tasks.ts`); the direct path may therefore reach all of `bench/work/`, the codemode path only the sandbox.
- The `log-triage` task is the one built for code mode: 20 log files of 60 lines each must be read and counted, so a model working tool by tool pulls them all into context while a script returns only the counts.

Reproduce: `npm run bench -- --service filesystem --variant calls --runs 3`.

### Claude

#### Model: `claude-sonnet-5-5` via `claude`

##### Per-task summary

| Task | Pass (d/c) | Tokens: direct | codemode | Change | Time: direct | codemode | Change | Cost: direct | codemode |
|---|---|---|---|---|---|---|---|---|---|
| list_allowed_directories | 3/3 / 3/3 | 11,029 | 2,763 | **-75%** | 7.3s | 8.1s | **11%** | $0.004 | $0.002 |
| read_text_file | 3/3 / 3/3 | 11,122 | 2,849 | **-74%** | 15.9s | 7.9s | **-51%** | $0.006 | $0.004 |
| read_multiple_files | 3/3 / 3/3 | 11,446 | 3,061 | **-73%** | 7.4s | 8.5s | **15%** | $0.008 | $0.006 |
| list_directory | 3/3 / 3/3 | 11,156 | 2,878 | **-74%** | 7.2s | 7.9s | **10%** | $0.006 | $0.004 |
| directory_tree | 3/3 / 3/3 | 11,366 | 3,130 | **-72%** | 7.8s | 8.5s | **9%** | $0.007 | $0.007 |
| search_files | 3/3 / 3/3 | 11,228 | 5,059 | **-55%** | 7.9s | 10.4s | **32%** | $0.007 | $0.012 |
| get_file_info | 3/3 / 3/3 | 11,283 | 3,012 | **-73%** | 8.0s | 8.0s | **-0%** | $0.007 | $0.005 |
| write_file | 3/3 / 3/3 | 11,240 | 2,882 | **-74%** | 7.9s | 8.0s | **2%** | $0.007 | $0.005 |
| edit_file | 3/3 / 3/3 | 11,421 | 4,758 | **-58%** | 7.8s | 9.5s | **21%** | $0.008 | $0.009 |
| create_directory | 3/3 / 3/3 | 11,199 | 3,165 | **-72%** | 8.3s | 8.7s | **5%** | $0.006 | $0.007 |

Token change ranges from **-75%** (list_allowed_directories) to **-55%** (search_files).

##### Task: list_allowed_directories

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,417 | 71 | 4 | 10,954 | 11,029 | $0.004 | 7.3s |
| codemode | 3/3 | 2.0 | 1.0 | 1,240 | 106 | 4 | 2,653 | 2,763 | $0.002 | 8.1s |

##### Task: read_text_file

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,432 | 113 | 165 | 10,844 | 11,122 | $0.006 | 15.9s |
| codemode | 3/3 | 2.0 | 1.0 | 1,255 | 146 | 183 | 2,520 | 2,849 | $0.004 | 7.9s |

##### Task: read_multiple_files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 3.0 | 2.0 | 5,465 | 203 | 260 | 10,983 | 11,446 | $0.008 | 7.4s |
| codemode | 3/3 | 2.0 | 1.0 | 1,288 | 218 | 286 | 2,556 | 3,061 | $0.006 | 8.5s |

##### Task: list_directory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,429 | 117 | 190 | 10,849 | 11,156 | $0.006 | 7.2s |
| codemode | 3/3 | 2.0 | 1.0 | 1,252 | 156 | 200 | 2,521 | 2,878 | $0.004 | 7.9s |

##### Task: directory_tree

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,435 | 152 | 300 | 10,914 | 11,366 | $0.007 | 7.8s |
| codemode | 3/3 | 2.0 | 1.0 | 1,258 | 211 | 501 | 2,417 | 3,130 | $0.007 | 8.5s |

##### Task: search_files

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,432 | 162 | 196 | 10,870 | 11,228 | $0.007 | 7.9s |
| codemode | 3/3 | 3.0 | 2.0 | 1,255 | 400 | 754 | 3,905 | 5,059 | $0.012 | 10.4s |

##### Task: get_file_info

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,436 | 102 | 348 | 10,832 | 11,283 | $0.007 | 8.0s |
| codemode | 3/3 | 2.0 | 1.0 | 1,259 | 144 | 361 | 2,507 | 3,012 | $0.005 | 8.0s |

##### Task: write_file

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,439 | 153 | 202 | 10,885 | 11,240 | $0.007 | 7.9s |
| codemode | 3/3 | 2.0 | 1.0 | 1,262 | 186 | 232 | 2,464 | 2,882 | $0.005 | 8.0s |

##### Task: edit_file

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,442 | 163 | 306 | 10,952 | 11,421 | $0.008 | 7.8s |
| codemode | 3/3 | 3.0 | 2.0 | 1,265 | 336 | 487 | 3,935 | 4,758 | $0.009 | 9.5s |

##### Task: create_directory

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 3/3 | 2.0 | 1.0 | 5,439 | 135 | 195 | 10,869 | 11,199 | $0.006 | 8.3s |
| codemode | 3/3 | 2.0 | 1.0 | 1,262 | 240 | 378 | 2,547 | 3,165 | $0.007 | 8.7s |

##### All tasks

| Path | Pass | Turns | Tool calls | First-turn context | Output | Fresh input (new + cache write) | Cache read | Total tokens | Cost | Wall time |
|---|---|---|---|---|---|---|---|---|---|---|
| direct | 30/30 | 2.1 | 1.1 | 5,437 | 137 | 217 | 10,895 | 11,249 | $0.007 | 8.5s |
| codemode | 30/30 | 2.2 | 1.2 | 1,260 | 214 | 339 | 2,803 | 3,356 | $0.006 | 8.5s |

Total tokens, codemode vs direct: **-70%** (3,356 vs 11,249).

Wall time, codemode vs direct: **-0%** (8.5s vs 8.5s). Wall time covers the whole headless run: MCP server start-up, model latency per turn, and the tool's own execution.

## Per-tool-call benchmark (no model)

One upstream tool call at a time, so no single tool or scenario can hide in an average. The same cases drive three views: what each tool's **definition** costs the model on every turn, how long **one call** takes directly versus through codemode's sandbox, and (optionally) the tokens a model spends making that one call (the `calls` variant in `npm run bench`). Method and caveats: [../../README.md](../../README.md).

Generated 2026-11-22. 16 upstream tools, 12 cases over 12 tools, 8 timed iterations per case after one warm-up.
Reproduce: `npm run bench:calls -- --service filesystem --iters 8`.

### Definition cost per tool

What the model is sent for each tool on **every turn**. `Direct` is the tool's name, description and input schema as JSON. `Codemode, always sent` is that tool's line in the `execute_code` description (name, parameters, one-line summary). `On demand` is its full TypeScript declaration, which the model only receives if it calls `get_api`. Tokens are estimated as characters / 4: good for comparing rows with each other, not an exact count.

| Tool | Direct (≈ tokens) | Codemode, always sent (≈) | Codemode, on demand via get_api (≈) | In per-call cases |
|---|---|---|---|---|
| edit_file | 380 | 9 | 333 | yes |
| directory_tree | 370 | 13 | 340 | yes |
| search_files | 354 | 12 | 333 | yes |
| read_text_file | 265 | 10 | 236 | yes |
| move_file | 222 | 9 | 209 | no |
| append_file | 212 | 8 | 202 | yes |
| list_directory_with_sizes | 203 | 11 | 201 | yes |
| write_file | 182 | 7 | 171 | yes |
| create_directory | 176 | 7 | 178 | yes |
| read_multiple_files | 172 | 8 | 175 | yes |
| read_file | 171 | 8 | 137 | no |
| list_directory | 168 | 6 | 167 | yes |
| copy_file | 165 | 9 | 151 | no |
| get_file_info | 162 | 6 | 160 | yes |
| read_media_file | 147 | 6 | 181 | no |
| list_allowed_directories | 102 | 8 | 120 | yes |
| **Total sent every turn** | **3,447** | **351** (execute_code and get_api, with their fixed text) | | |

The biggest single definition is 380 tokens, 11% of the direct total.

**Truncation guard.** Claude Code cuts an MCP tool description at about 2,048 characters; anything past that never reaches the model. The `execute_code` description here is **995 characters** (fits), listing every function at detail level 2 (1 = parameter types and summary, 2 = parameter names, 3 = names only, 4 = names cut to fit). An earlier design put the whole typed API in the description; it was cut off and the model never saw the function list (see ../../README.md).

### Latency per call (no model)

Wall time for one tool call, in milliseconds, measured over a live connection. `Codemode` includes the sandbox start, the generated bridge and the upstream call. Chars is the size of what comes back to the model.

| Case | Direct median | Direct p95 | Codemode median | Codemode p95 | Overhead (median) | Chars: direct | Chars: codemode | Errors (d/c) |
|---|---|---|---|---|---|---|---|---|
| list_allowed_directories | 0.8 | 1.1 | 3.0 | 3.5 | +2.1 ms | 60 | 93 | 0/0 |
| read_text_file | 2.4 | 2.7 | 4.6 | 5.4 | +2.2 ms | 10 | 37 | 0/0 |
| read_multiple_files | 2.9 | 3.4 | 5.0 | 5.5 | +2.1 ms | 134 | 181 | 0/0 |
| list_directory | 1.3 | 1.5 | 2.8 | 3.1 | +1.5 ms | 51 | 81 | 0/0 |
| list_directory_with_sizes | 2.0 | 2.6 | 3.5 | 3.9 | +1.5 ms | 235 | 268 | 0/0 |
| directory_tree | 1.6 | 1.8 | 2.8 | 3.4 | +1.2 ms | 293 | 385 | 0/0 |
| search_files | 2.4 | 2.8 | 3.9 | 4.0 | +1.5 ms | 16 | 43 | 0/0 |
| get_file_info | 0.9 | 1.1 | 2.0 | 2.2 | +1.0 ms | 276 | 310 | 0/0 |
| write_file | 2.1 | 2.5 | 3.4 | 3.9 | +1.4 ms | 75 | 109 | 0/0 |
| append_file | 1.5 | 1.8 | 2.8 | 3.2 | +1.4 ms | 78 | 112 | 0/0 |
| edit_file | 1.8 | 1.9 | 3.1 | 3.4 | +1.3 ms | 321 | 381 | 0/0 |
| create_directory | 0.9 | 1.0 | 1.9 | 2.2 | +1.1 ms | 86 | 121 | 0/0 |

Sandbox-only cost (`return 1` through `execute_code`, no upstream call): median 0.8 ms, p95 1.2 ms. This is the floor of codemode's per-call overhead.

### Coverage

Cases cover 12 of 16 tools. The rest are skipped on purpose:

| Tool | Why it is not benchmarked |
|---|---|
| read_file | Deprecated alias of read_text_file. |
| read_media_file | Needs an image or audio file; the result is binary data. |
| move_file | Not repeatable: the source is gone after the first call. Covered by the organize scenario. |
| copy_file | Not repeatable: the destination exists after the first call. |

### Cases

| Case | Arguments | Model prompt |
|---|---|---|
| list_allowed_directories | `{}` | yes |
| read_text_file | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls\\a.txt"}` | yes |
| read_multiple_files | `{"paths":["C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls\\a.txt","C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls\\b.txt"]}` | yes |
| list_directory | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls"}` | yes |
| list_directory_with_sizes | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls","sortBy":"name"}` | latency only |
| directory_tree | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls"}` | yes |
| search_files | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls","pattern":"c.txt"}` | yes |
| get_file_info | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls\\a.txt"}` | yes |
| write_file | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls\\out.txt","content":"written-4821"}` | yes |
| append_file | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls\\log.txt","content":"line\n"}` | latency only |
| edit_file | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls\\edit.txt","edits":[{"oldText":"AAA","newText":"BBB"}],"dryRun":true}` | yes |
| create_directory | `{"path":"C:\\repos\\codemode\\bench\\work\\fs-sandbox\\calls\\made\\deep"}` | yes |

## Task prompts

Identical text is sent on both paths. Prompts never name tools.

### `scenarios`

- **notes-index**: Work only inside C:\repos\codemode\bench\work\fs-sandbox. Create the folder notes/2026 there. Inside it create three Markdown files note_1.md, note_2.md and note_3.md, where note_N.md contains exactly two lines: "# Note N" and then "Body N" (N is its number). Also create notes/INDEX.md with one line per note, in order, in the form "- [Note N](2026/note_N.md)". Then reply with one short sentence.
- **log-triage** (pre-seeded): Work only inside C:\repos\codemode\bench\work\fs-sandbox, which holds 20 log files named app_NN.log. Write C:\repos\codemode\bench\work\fs-sandbox\summary.csv with the header line "file,errors,warnings" and then one line per log file giving its name, the number of lines containing " ERROR " and the number containing " WARN ", sorted by errors, most first, ties by file name A to Z. Reply with one short sentence that names the file with the most errors.
- **organize** (pre-seeded): Work only inside C:\repos\codemode\bench\work\fs-sandbox, which holds 40 loose files of several types. Move every file into a subfolder named after its extension in upper case (for example photo.jpg goes into JPG), creating the folders as needed. Do not delete or rename anything. Reply with one short sentence giving the number of files you moved.
- **retries** (pre-seeded): Work only inside C:\repos\codemode\bench\work\fs-sandbox, which holds a tree of .cfg files in nested folders. In every .cfg file whose line reads exactly "retries=3", change that line to "retries=5". Files with any other retries value must stay exactly as they are. Reply with one short sentence giving the number of files you changed.

### `calls`

- **list_allowed_directories** (pre-seeded): Which directories are you allowed to access? Reply with one short sentence naming the folder.
- **read_text_file** (pre-seeded): Read the file C:\repos\codemode\bench\work\fs-sandbox\calls\a.txt and tell me exactly what it contains.
- **read_multiple_files** (pre-seeded): Read C:\repos\codemode\bench\work\fs-sandbox\calls\a.txt and C:\repos\codemode\bench\work\fs-sandbox\calls\b.txt and tell me what each contains, in one short sentence.
- **list_directory** (pre-seeded): List the contents of C:\repos\codemode\bench\work\fs-sandbox\calls and reply with the names in one short sentence.
- **directory_tree** (pre-seeded): Show the folder tree of C:\repos\codemode\bench\work\fs-sandbox\calls and tell me which file lives inside the sub folder.
- **search_files** (pre-seeded): Search C:\repos\codemode\bench\work\fs-sandbox\calls for a file called c.txt and tell me which folder it is in.
- **get_file_info** (pre-seeded): What is the size in bytes of C:\repos\codemode\bench\work\fs-sandbox\calls\a.txt? Reply with one short sentence.
- **write_file** (pre-seeded): Write the text written-4821 to the file C:\repos\codemode\bench\work\fs-sandbox\calls\out.txt, then reply with one short sentence.
- **edit_file** (pre-seeded): In the file C:\repos\codemode\bench\work\fs-sandbox\calls\edit.txt replace the word AAA with BBB, then reply with one short sentence.
- **create_directory** (pre-seeded): Create the folder C:\repos\codemode\bench\work\fs-sandbox\calls\made\deep (including any parent folders), then reply with one short sentence.
