import { MessageChannel, Worker } from 'node:worker_threads';
import { runInQuickJS, stripTypes } from './sandbox-core.ts';
import type { SandboxApi, SandboxLimits, SandboxResult } from './types.ts';

export { stripTypes };

/** Extra time past the script's own deadline before the worker is killed from outside. */
const WATCHDOG_GRACE_MS = 2_000;
/** Cap on the worker's own JavaScript heap, so a huge result cannot exhaust the wrapper's memory. */
const WORKER_HEAP_MB = 1024;
/** Workers kept ready between scripts (starting one costs about a hundred milliseconds). */
const MAX_IDLE_WORKERS = 2;

const idle: Worker[] = [];

function spawn(): Worker {
  const worker = new Worker(new URL('./sandbox-worker.ts', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB } });
  worker.unref(); // a parked worker must not keep the process alive
  // A worker that dies while parked must neither crash the process nor be handed out again.
  const forget = (): void => {
    const at = idle.indexOf(worker);
    if (at >= 0) idle.splice(at, 1);
  };
  worker.on('error', forget);
  worker.on('exit', forget);
  return worker;
}

/**
 * Run model-written code in a QuickJS (WASM) sandbox inside a worker thread.
 *
 * The script, including a `while (true) {}`, runs on another thread, so the wrapper's own event loop keeps serving
 * timers, the MCP connection and other scripts. A script that does not stop by its own deadline (or that exhausts the
 * worker's memory or crashes it) costs a worker, never the wrapper: the worker is terminated and the call returns an error.
 *
 * Upstream calls (`api.callTool`) and the `store` (`api.syncCall`) still run here, on the main thread; the worker reaches
 * them by message. See `sandbox-core.ts` for what the guest can do.
 */
export function runInSandbox(code: string, api: SandboxApi, limits: SandboxLimits = {}): Promise<SandboxResult> {
  const { timeoutMs = 60_000 } = limits;
  const worker = idle.pop() ?? spawn();
  const calls = new MessageChannel();
  const syncs = new MessageChannel();
  const flag = new Int32Array(new SharedArrayBuffer(4));
  const abort = new AbortController();

  return new Promise<SandboxResult>((resolve) => {
    let finished = false;
    const finish = (result: SandboxResult, healthy: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      abort.abort(); // cancels upstream calls the script left running
      worker.off('error', onError);
      worker.off('exit', onExit);
      calls.port1.close();
      syncs.port1.close();
      if (healthy && idle.length < MAX_IDLE_WORKERS) idle.push(worker);
      else void worker.terminate();
      resolve(result);
    };

    const onError = (e: Error): void => finish({ logs: [], error: `The sandbox worker stopped: ${e.message}` }, false);
    const onExit = (exitCode: number): void => finish({ logs: [], error: `The sandbox worker exited (code ${exitCode})` }, false);
    const watchdog = setTimeout(
      () => finish({ logs: [], error: `Script timed out after ${timeoutMs} ms` }, false),
      timeoutMs + WATCHDOG_GRACE_MS,
    );

    worker.on('error', onError);
    worker.on('exit', onExit);

    // Upstream tool calls from the guest.
    calls.port1.on('message', (req: { n: number; id: string; input: unknown } | { done: true; result: SandboxResult }) => {
      if ('done' in req) {
        finish(req.result, true);
        return;
      }
      api.callTool(req.id, req.input, abort.signal).then(
        (value) => {
          if (finished) return;
          try {
            calls.port1.postMessage({ n: req.n, ok: true, value });
          } catch (e) {
            calls.port1.postMessage({ n: req.n, ok: false, message: `The result could not be passed to the sandbox: ${e instanceof Error ? e.message : String(e)}` });
          }
        },
        (e: unknown) => {
          if (!finished) calls.port1.postMessage({ n: req.n, ok: false, message: e instanceof Error ? e.message : String(e) });
        },
      );
    });

    // `store` calls: answer, then wake the worker, which is waiting on `flag`.
    syncs.port1.on('message', (req: { id: string; input: unknown }) => {
      let reply: unknown;
      try {
        reply = api.syncCall?.(req.id, req.input) ?? { handled: false };
      } catch (e) {
        reply = { error: e instanceof Error ? e.message : String(e) };
      }
      syncs.port1.postMessage(reply);
      Atomics.store(flag, 0, 1);
      Atomics.notify(flag, 0);
    });

    worker.postMessage(
      { type: 'run', code, namespace: api.namespace, ids: [...api.ids], limits, callPort: calls.port2, syncPort: syncs.port2, flag },
      [calls.port2, syncs.port2],
    );
  });
}

/** In-thread variant, for callers that already run inside a worker. */
export { runInQuickJS };
