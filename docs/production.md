# Production-grade, scalable and secure: research and plan

Research done on 2026-11-22, plus a review of this repo's own code. "Verified here" means we ran it; "sourced" means it comes from the linked page; vendor blogs are marked because they sell what they compare. Nothing below has been implemented unless it says so.

## 1. What "production" means for this repo

The wrapper today is a **local stdio process, one per user and client**. That already scales with the number of users, because every user runs their own copy next to their own client and credentials. "Scalable" starts to matter only if codemode is offered as a **hosted, shared service**: one deployment, many users, remote clients. Those are two different projects with very different security needs, and most of the advice below applies to the second.

| Mode | State today | What it needs |
|---|---|---|
| Local, one user (stdio) | Works | Supply-chain care, honest limits, audit trail, tests in CI |
| Hosted, many users (HTTP) | Does not exist: the server speaks stdio only | Authentication, per-tenant isolation, stateless design, a hard sandbox, observability, rate limits |

## 2. Threat model

| Untrusted thing | How it hurts | Where this repo stands |
|---|---|---|
| **Model-written code** (may be steered by injected text) | Escape the sandbox, exhaust resources, abuse tools | QuickJS compiled to WebAssembly, no network, files or imports; time, memory, call, output and store caps |
| **Upstream tool results** (web pages, tickets, documents) | Prompt injection: text that instructs the model | Not mitigated; codemode helps only by keeping most data out of the context |
| **The upstream server itself** (npm or PyPI package) | Runs with your privileges; may change later | Versions pinned, minimal environment; transitive dependencies and later changes are not covered |
| **Tool metadata** (names, descriptions, schemas) | Poisoned descriptions steer the model | Passed through as is; not hashed or reviewed |
| **Other tenants** (hosted mode only) | Reading each other's data or credentials | Not applicable yet |

## 3. Findings, with sources

### 3.1 The sandbox is decent, but it is not the last line of defence

- QuickJS compiled to WebAssembly keeps a bug in the engine's memory handling inside the module's own linear memory. That is an **inference**, not something any source states. Several memory-safety CVEs exist in QuickJS and quickjs-ng during 2025-2026 (for example [CVE-2025-46687](https://osv.dev/vulnerability/CVE-2025-12745), and [Gentoo's advisory](https://security.gentoo.org/glsa/202608-19) for quickjs-ng); search results did not say whether any escapes a WebAssembly build.
- Our installed `quickjs-emscripten` is 0.32.0, the latest on npm today.
- For stronger isolation, sources agree on an order: plain containers share a kernel (weakest), gVisor intercepts system calls in user space, Firecracker microVMs give a separate guest kernel and are the strongest ([Fly.io comparison](https://fly.io/learn/firecracker-vs-gvisor/), [overview](https://dev.to/aiagentengineering/how-to-sandbox-ai-agents-in-2026-firecracker-gvisor-runtimes-isolation-strategies-14pk)). These are vendor-written; none benchmarks V8 isolates or WebAssembly against them.
- **Verified here:** a script runs on the Node event loop. A `while (true)` script with a 1.5 s timeout stopped every timer in the process for the whole 1.5 s. The deadline still fires, but a hosted deployment would let one tenant stall all others for up to 60 s.
- **Verified here:** the limits cap the guest, not the host. An upstream that returns a very large result is read fully into the Node process before it reaches the guest.

### 3.2 Supply chain is the biggest practical risk

- Pinning one package does not pin what it pulls in. A [Socket analysis](https://socket.dev/glossary/mcp-security) says a pin on the official filesystem server covers 1 of 12 installed packages, that `npx` resolves the rest from ranges on a fresh install, that npm provenance covers only the top-level tarball, and that MCP servers run their entry point even with `--ignore-scripts`. Vendor source; check the numbers before quoting them.
- "Rug pull": a tool passes review and its definition changes later. The [CSA white paper](https://labs.cloudsecurityalliance.org/research-rb/csa-whitepaper-mcp-security-tool-poisoning-20260506-csa-styled/) and a [taxonomy paper](https://arxiv.org/pdf/2603.18063) note that clients generally do not warn when a tool definition changes. The first malicious MCP server seen in the wild, `postmark-mcp`, was an npm package ([Palo Alto Networks, via Socket](https://socket.dev/glossary/mcp-security)).
- What we do now: every upstream installs from a lockfile with integrity hashes (`servers/`), and every tool definition is hashed in `services/<name>.lock.json` so a change is refused until someone reads it. Still open: an upstream's own entry point runs with your privileges (a lock reduces surprise, it is not a sandbox), and `npm run add` still scaffolds an unlocked `npx` service.

### 3.3 Prompt injection is not solved here, and cannot be by filtering

- The "[lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)": an agent with access to private data, exposure to untrusted content and a way to communicate externally can be made to leak. Sources agree the defence is architectural: never let all three legs exist in one trusted context ([Zscaler](https://www.zscaler.com/blogs/product-insights/lethal-trifecta-zero-trust), [Nightfall](https://www.nightfall.ai/blog/how-do-ai-agents-create-data-exfiltration-risk)). Human approval as a mitigation was not covered by the sources found; "Agents Rule of Two" and "CaMeL" were named and not read.
- Codemode's own contribution is real but partial: a script can fetch, filter and reduce data without the raw text ever entering the model's context. It does not stop injected text in what the script returns.
- A wrapped service can add a leg without anyone noticing: Windows (file and shell access plus network tools), Playwright (untrusted pages), Notion (private data, writes).

### 3.4 What the MCP specification says (relevant if we serve over HTTP)

From the [2025-11-25 security best practices](https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices):

- **Token passthrough is forbidden:** servers "MUST NOT accept any tokens that were not explicitly issued for the MCP server".
- **Confused deputy** (proxy servers with a static client id and dynamic registration): per-client consent, exact redirect-URI matching, single-use short-lived `state`, `__Host-` consent cookies.
- **Sessions are not authentication:** every inbound request must be verified, session ids must be non-deterministic and should be bound to the user.
- **SSRF** when fetching OAuth or discovery URLs: require https (loopback excepted), block private, loopback and link-local ranges including 169.254.0.0/16, validate each redirect hop, consider an egress proxy, pin DNS results.
- **Local servers:** should use stdio or authenticated local transports; installers must show the exact command and require approval; servers should be sandboxed with minimal privileges.
- **Scopes:** minimal first, elevate on demand; no wildcard scopes.

Our current https-only check for `url` upstreams does **not** block private or metadata addresses, so it is not SSRF protection. That matters as soon as a tenant, not an operator, can choose the URL.

### 3.5 Scaling remote MCP

- Sessions that pin traffic to one server (`Mcp-Session-Id`) are the bottleneck. The MCP project's [transport roadmap](https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/) (Dec 2025) wants stateless requests, routing data in headers, and `/.well-known/mcp.json` server cards, with a spec release "tentatively" in June 2026. **We could not confirm whether that shipped**; check the current spec before designing around it. Microsoft's and the TypeScript SDK's docs already recommend stateless mode for HTTP servers ([overview](https://pub.towardsai.net/how-to-scale-mcp-servers-fb29ecdd409e), [IBM gateway note](https://ibm.github.io/mcp-context-forge/architecture/adr/038-multi-worker-session-affinity)).
- Our blockers for stateless horizontal scaling: the `store` lives in process memory; each wrapper holds one long-lived upstream child process; a CPU-bound script blocks the event loop (above).

### 3.6 Observability

- OpenTelemetry has [MCP semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/index.md) next to the GenAI ones: tool calls map to `execute_tool` spans, with `gen_ai.tool.name`, `mcp.method.name` and W3C trace propagation. Status is "Development" and they moved repositories in mid-2026 per secondary sources, so treat attribute names as unstable.
- Today we have the plain-text `CODEMODE_LOG` debugging aid, which is the opposite of an audit log: it records everything, unredacted.

## 4. Plan, by priority

**P0, before anyone else relies on it (local, stdio)**
1. **Install upstream servers from a lockfile**, not `npx -y` on every start: a dedicated folder per service, `npm ci`, exact tarball integrity from the lockfile; same for Python with `uv` and a hashed lock. Closes the transitive-dependency gap.
2. **Tool-definition lock**: on first run, store a hash of every upstream tool's name, description and schema (`codemode.lock.json`, committed); on a mismatch refuse to start, or start with that tool removed, and say why. This is the cheap defence against rug pulls.
3. **Structured, redacted audit log** replacing `CODEMODE_LOG`: one line per upstream call (tool, argument hash, duration, outcome), never argument or result values unless asked; separate from debugging.
4. **CI**: typecheck, tests, `bench:validate`, `npm audit signatures`, dependency review, and Dependabot or Renovate on `package.json` and the service pins.
5. **Adversarial tests** for the sandbox that need no model: output flood, memory bomb, deep recursion, prototype tricks, the `__call` and `__sync` entry points, argument-validation bypasses.
6. **Capability profile per service**: declare which of the three trifecta legs a service has (private data, untrusted content, external communication) and warn at startup when a configuration exposes all three, with `access` presets (`readOnly`, `noDelete`) documented per service.

### Status of the P0 items (2026-11-22)

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Install upstream servers from lockfiles | Done | `servers/package-lock.json`, `servers/python/uv.lock` (1,175 hashes), `servers/resolve.ts`, `npm run servers:install`; services and the benchmark both launch from it |
| 2 | Tool-definition lock | Done | `src/toollock.ts`, `services/*.lock.json`, `--update-lock`, `npm run lock:update` / `lock:verify`; a tampered lock is refused (tested) |
| 3 | Redacted audit log | Done | `src/audit.ts`, `CODEMODE_AUDIT`; a test proves code, argument values and results never reach the file. `CODEMODE_LOG` is now `CODEMODE_DEBUG_LOG` |
| 4 | CI | Done, green on GitHub | `.github/workflows/ci.yml` (typecheck, tests on Linux and Windows, validate, `npm audit`, `npm audit signatures`, lockfile and tool-lock checks) and `dependabot.yml`. A `dependency-review` workflow was tried and removed: it needs the dependency graph and Advanced Security, which a private repo does not have. Actions are pinned by tag, not by commit SHA |
| 5 | Adversarial sandbox tests | Done, and found a real bug | `test/sandbox-adversarial.test.ts`. Runaway recursion overflowed the **host** stack before QuickJS's own limit, left the engine half-freed and aborted it on cleanup: a model-written script could crash the call and poison the engine. Fixed by a 320 KB guest stack limit and non-fatal cleanup |
| 6 | Capability profile and warning | Partly done | `src/capabilities.ts`; every service declares its legs and all-three-without-`access` warns at start. Not done: per-service documented `access` presets |

Not part of P0 and still true: a script runs on the Node event loop, and the host-side size of an upstream result is not capped (section 3.1).
**P1, hardening for shared or unattended use**
7. **Run the sandbox out of the main thread**: a worker thread or child process per execution, with hard memory limits and kill-on-timeout, so a runaway script cannot stall or exhaust the wrapper. Cap the size of any upstream result before it is read into memory.
8. **Keep chosen tools native**: tools that need approval (deletes, sends, payments) are not exposed in the code API and stay as ordinary tools the client can gate; the `access` config already supports removing them, this makes it a documented pattern.
9. **OpenTelemetry spans and metrics** for each `execute_code` and each upstream call, following the MCP and GenAI conventions, with limit hits and truncations as counters.
10. **Upstream URL hardening**: block private, loopback and link-local ranges and redirects to them, pin DNS results.

**P2, only if a hosted service is a real goal**
11. Streamable HTTP server in stateless mode, OAuth per the MCP authorization spec, no token passthrough, per-user session binding.
12. Per-tenant isolation: separate sandbox processes at minimum; gVisor or Firecracker if tenants are mutually untrusted; per-tenant upstream credentials from a secrets manager; per-tenant rate limits and quotas.
13. Move the `store` to an external store keyed by tenant and session, or drop it for hosted use.

**Not worth doing yet:** replacing QuickJS (no evidence it is the weak point), building our own prompt-injection filter (sources say filtering does not work), or a hosted offering before items 1-6 are in place.

## 5. Open questions

- Did the stateless-transport spec release land, and what exactly changed? (Read the current spec changelog.)
- Do any of the QuickJS CVEs reach the WebAssembly build? (Read the `quickjs-emscripten` security notes and the upstream commits.)
- What does "Agents Rule of Two" recommend for human approval, and is it practical for scripted tool calls? (Not read.)
- Should `codemode.lock.json` live per user or per repository?
