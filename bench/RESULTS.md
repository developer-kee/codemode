# Benchmarks by service

Each service is benchmarked separately: the same model, prompts and checks on two paths, the upstream MCP server used directly versus the same server behind codemode (`execute_code` with `get_api`). A service has several variants (the scenario tasks, one tool call per task, ...), listed as separate rows.
Method, metric definitions and limitations: [README.md](README.md). Per-service detail and raw runs are linked below.

## Verdicts

One line per service, from the same fixed rule as the TL;DR at the top of each report (default variant, all models pooled).

| Service | Verdict | Report |
|---|---|---|
| Blender | Saves a lot of tokens with similar time (tokens -71%, time +0%). | [suites/blender/RESULTS.md](suites/blender/RESULTS.md) |
| Windows (Windows-MCP) | Saves a lot of tokens with similar time (tokens -65%, time +2%). | [suites/windows/RESULTS.md](suites/windows/RESULTS.md) |
| Playwright (browser, local test site) | Saves a lot of tokens with similar time (tokens -69%, time +11%). | [suites/playwright/RESULTS.md](suites/playwright/RESULTS.md) |
| Filesystem (reference MCP server) | Saves a lot of tokens and is faster (tokens -88%, time -47%). | [suites/filesystem/RESULTS.md](suites/filesystem/RESULTS.md) |
| Notion (official MCP server) | No runs yet, so nothing is measured. | [suites/notion/RESULTS.md](suites/notion/RESULTS.md) |
| Notion (hosted MCP server, OAuth) | Codemode passed fewer runs than direct. Read the failed runs below before trusting the savings. | [suites/notion-oauth/RESULTS.md](suites/notion-oauth/RESULTS.md) |

## Models

| Model | Provider | Runner | Runs | Services |
|---|---|---|---|---|
| `claude-sonnet-5-5` | Claude | `claude` | 252 | blender, windows, playwright, filesystem, notion-oauth |
| `deepseek-flash` | DeepSeek | `dsh` | 36 | playwright |

## Compare models

Each cell is the **token change**, `codemode / direct` total tokens, and passed/runs. Columns are models; rows are variants (and services in the overview). Compare across columns with the caveat that each family runs under its own harness, and compare codemode vs direct within a cell. `not run` means no runs for that model there yet.

| Service | Variant | `claude-sonnet-5-5` (Claude, `claude`) | `deepseek-flash` (DeepSeek, `dsh`) |
|---|---|---|---|
| Blender | `scenarios` | **-71%** · 8,108 / 27,678 · 24/24 | not run |
| Blender | `calls` | **-82%** · 3,090 / 17,468 · 18/18 | not run |
| Windows (Windows-MCP) | `scenarios` | **-65%** · 8,101 / 22,860 · 18/18 | not run |
| Windows (Windows-MCP) | `scenarios-4-tools` | **-3%** · 7,870 / 8,146 · 18/18 | not run |
| Windows (Windows-MCP) | `calls` | **-78%** · 3,538 / 15,825 · 42/42 | not run |
| Playwright (browser, local test site) | `scenarios` | **-71%** · 8,435 / 29,359 · 18/18 | **-68%** · 18,923 / 60,019 · 18/18 |
| Playwright (browser, local test site) | `calls` | **-83%** · 3,594 / 21,020 · 18/18 | **-82%** · 3,249 / 17,647 · 18/18 |
| Filesystem (reference MCP server) | `scenarios` | **-88%** · 6,218 / 53,069 · 24/24 | not run |
| Filesystem (reference MCP server) | `calls` | **-70%** · 3,356 / 11,249 · 60/60 | not run |
| Notion (hosted MCP server, OAuth) | `scenarios` | **-89%** · 50,589 / 459,735 · 11/12 | not run |

## Detail by model family

Full per-task tables for each model. The comparison above is the quick view; these are the underlying numbers.

### Claude

| Service | Variant | Model | Runner | Runs (pass) | Total tokens: direct | codemode | Change | Wall time: direct | codemode | Change | Detail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Blender | `scenarios` | `claude-sonnet-5-5` | `claude` | 24 (24) | 27,678 | 8,108 | **-71%** | 11.5s | 11.6s | **0%** | [suites/blender/RESULTS.md](suites/blender/RESULTS.md) |
| Blender | `calls` | `claude-sonnet-5-5` | `claude` | 18 (18) | 17,468 | 3,090 | **-82%** | 7.1s | 7.0s | **-1%** | [suites/blender/RESULTS.md](suites/blender/RESULTS.md) |
| Windows (Windows-MCP) | `scenarios` | `claude-sonnet-5-5` | `claude` | 18 (18) | 22,860 | 8,101 | **-65%** | 14.8s | 15.1s | **2%** | [suites/windows/RESULTS.md](suites/windows/RESULTS.md) |
| Windows (Windows-MCP) | `scenarios-4-tools` | `claude-sonnet-5-5` | `claude` | 18 (18) | 8,146 | 7,870 | **-3%** | 19.6s | 16.0s | **-19%** | [suites/windows/RESULTS.md](suites/windows/RESULTS.md) |
| Windows (Windows-MCP) | `calls` | `claude-sonnet-5-5` | `claude` | 42 (42) | 15,825 | 3,538 | **-78%** | 12.1s | 12.0s | **-1%** | [suites/windows/RESULTS.md](suites/windows/RESULTS.md) |
| Playwright (browser, local test site) | `scenarios` | `claude-sonnet-5-5` | `claude` | 18 (18) | 29,359 | 8,435 | **-71%** | 11.0s | 11.9s | **8%** | [suites/playwright/RESULTS.md](suites/playwright/RESULTS.md) |
| Playwright (browser, local test site) | `calls` | `claude-sonnet-5-5` | `claude` | 18 (18) | 21,020 | 3,594 | **-83%** | 8.7s | 8.6s | **-1%** | [suites/playwright/RESULTS.md](suites/playwright/RESULTS.md) |
| Filesystem (reference MCP server) | `scenarios` | `claude-sonnet-5-5` | `claude` | 24 (24) | 53,069 | 6,218 | **-88%** | 20.4s | 10.9s | **-47%** | [suites/filesystem/RESULTS.md](suites/filesystem/RESULTS.md) |
| Filesystem (reference MCP server) | `calls` | `claude-sonnet-5-5` | `claude` | 60 (60) | 11,249 | 3,356 | **-70%** | 8.5s | 8.5s | **-0%** | [suites/filesystem/RESULTS.md](suites/filesystem/RESULTS.md) |
| Notion (hosted MCP server, OAuth) | `scenarios` | `claude-sonnet-5-5` | `claude` | 12 (11) | 459,735 | 50,589 | **-89%** | 14.0s | 13.6s | **-3%** | [suites/notion-oauth/RESULTS.md](suites/notion-oauth/RESULTS.md) |

### DeepSeek

| Service | Variant | Model | Runner | Runs (pass) | Total tokens: direct | codemode | Change | Wall time: direct | codemode | Change | Detail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Playwright (browser, local test site) | `scenarios` | `deepseek-flash` | `dsh` | 18 (18) | 60,019 | 18,923 | **-68%** | 19.6s | 22.2s | **13%** | [suites/playwright/RESULTS.md](suites/playwright/RESULTS.md) |
| Playwright (browser, local test site) | `calls` | `deepseek-flash` | `dsh` | 18 (18) | 17,647 | 3,249 | **-82%** | 10.5s | 12.2s | **17%** | [suites/playwright/RESULTS.md](suites/playwright/RESULTS.md) |

Figures are means across all tasks and runs of that variant. Small differences, especially in wall time, are within noise at this sample size. Services and variants are not comparable with each other: tasks and tool counts differ.
