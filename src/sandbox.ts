import {
  newQuickJSWASMModule,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSDeferredPromise,
  type QuickJSWASMModule,
} from 'quickjs-emscripten';
import { transform } from 'sucrase';
import type { SandboxApi, SandboxLimits, SandboxResult } from './types.ts';

let modulePromise: Promise<QuickJSWASMModule> | undefined;
const getModule = (): Promise<QuickJSWASMModule> => (modulePromise ??= newQuickJSWASMModule());

/** Strip TypeScript syntax so the model may write either TS or JS. */
export function stripTypes(code: string): string {
  return transform(code, { transforms: ['typescript'] }).code;
}

interface GuestError {
  name?: string;
  message?: string;
  stack?: string;
}

function formatError(err: unknown): string {
  if (err !== null && typeof err === 'object') {
    const e = err as GuestError;
    const msg = e.message ?? JSON.stringify(err);
    return e.stack ? `${e.name ?? 'Error'}: ${msg}\n${e.stack}` : msg;
  }
  return String(err);
}

/**
 * Run model-written code in a QuickJS (WASM) sandbox.
 *
 * The guest has no fetch, fs, network or process: the only way out is the `api.namespace` object, whose functions
 * return real promises that the host settles when `api.callTool` finishes. Because they are ordinary promises
 * (not Asyncify suspensions) the guest can `await` slow upstream calls, loop over them, and run several at once
 * with `Promise.all`. The code may use top-level await and `return`.
 */
export async function runInSandbox(
  code: string,
  api: SandboxApi,
  limits: SandboxLimits = {},
): Promise<SandboxResult> {
  const { timeoutMs = 60_000, memoryBytes = 128 * 1024 * 1024, maxLogChars = 100_000 } = limits;
  const QuickJS = await getModule();
  const vm: QuickJSContext = QuickJS.newContext(); // owns its runtime; disposing vm frees both
  const runtime = vm.runtime;
  runtime.setMemoryLimit(memoryBytes);
  runtime.setMaxStackSize(1024 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));

  const logs: string[] = [];
  let logChars = 0;
  const pushLog = (line: string): void => {
    if (logChars > maxLogChars) return;
    logChars += line.length;
    logs.push(logChars > maxLogChars ? `${line.slice(0, 200)} …[log truncated]` : line);
  };

  /** Host calls still running; the loop below waits on these. */
  const pending = new Set<Promise<void>>();
  const deferreds: QuickJSDeferredPromise[] = [];
  let timer: NodeJS.Timeout | undefined;

  try {
    const consoleObj = vm.newObject();
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      const fn = vm.newFunction(level, (...args) => {
        const text = args
          .map((h) => {
            const v: unknown = vm.dump(h);
            return typeof v === 'string' ? v : JSON.stringify(v);
          })
          .join(' ');
        pushLog(level === 'log' || level === 'info' ? text : `[${level}] ${text}`);
      });
      vm.setProp(consoleObj, level, fn);
      fn.dispose();
    }
    vm.setProp(vm.global, 'console', consoleObj);
    consoleObj.dispose();

    // __call(id, jsonInput) -> Promise<jsonResult string>, settled by the host when the upstream call finishes.
    const call = vm.newFunction('__call', (idH, inputH) => {
      const id = vm.getString(idH);
      const input: unknown = JSON.parse(vm.getString(inputH));
      const deferred = vm.newPromise();
      deferreds.push(deferred);
      const work = (async (): Promise<void> => {
        try {
          const out = await api.callTool(id, input);
          if (!vm.alive) return;
          const h = vm.newString(JSON.stringify(out ?? null));
          deferred.resolve(h);
          h.dispose();
        } catch (e) {
          if (!vm.alive) return;
          const h = vm.newError(e instanceof Error ? e.message : String(e));
          deferred.reject(h);
          h.dispose();
        }
      })();
      const tracked: Promise<void> = work.finally(() => {
        pending.delete(tracked);
      });
      pending.add(tracked);
      return deferred.handle;
    });
    vm.setProp(vm.global, '__call', call);
    call.dispose();

    // __sync(id, jsonInput) -> jsonResult: host functions that finish at once (the `store`), no promise involved.
    const sync = vm.newFunction('__sync', (idH, inputH) => {
      const id = vm.getString(idH);
      const input: unknown = JSON.parse(vm.getString(inputH));
      const r = api.syncCall?.(id, input);
      if (!r || !r.handled) return vm.newError(`Unknown sync call "${id}"`);
      return vm.newString(JSON.stringify(r.value ?? null));
    });
    vm.setProp(vm.global, '__sync', sync);
    sync.dispose();

    const prelude = `
      globalThis.${api.namespace} = {};
      for (const id of ${JSON.stringify(api.ids)}) {
        globalThis.${api.namespace}[id] = async (input) => JSON.parse(await __call(id, JSON.stringify(input ?? {})));
      }
      const syncCall = (id, input) => {
        const r = __sync(id, JSON.stringify(input));
        if (r instanceof Error) throw r;
        return JSON.parse(r);
      };
      // store: persists across scripts; the host handles the reserved "__store.*" ids.
      globalThis.store = {
        get(key) {
          const r = syncCall('__store.get', { key });
          return r.found ? JSON.parse(r.json) : undefined;
        },
        set(key, value) {
          syncCall('__store.set', { key, json: JSON.stringify(value) });
        },
        delete(key) {
          return syncCall('__store.delete', { key });
        },
        keys() {
          return syncCall('__store.keys', {});
        },
      };
    `;
    vm.unwrapResult(vm.evalCode(prelude)).dispose();

    const js = stripTypes(`(async () => {\n${code}\n})()`);
    const promiseHandle = vm.unwrapResult(vm.evalCode(js));

    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const jobs = runtime.executePendingJobs();
      if (jobs.error) {
        const err: unknown = vm.dump(jobs.error);
        jobs.error.dispose();
        promiseHandle.dispose();
        return { logs, error: formatError(err) };
      }

      const state = vm.getPromiseState(promiseHandle);
      if (state.type === 'fulfilled') {
        const value: unknown = state.notAPromise ? undefined : vm.dump(state.value);
        if (!state.notAPromise) state.value.dispose();
        promiseHandle.dispose();
        return value === undefined ? { logs } : { logs, result: value };
      }
      if (state.type === 'rejected') {
        const err: unknown = vm.dump(state.error);
        state.error.dispose();
        promiseHandle.dispose();
        return { logs, error: formatError(err) };
      }

      // Still pending: wait for a host call to finish (the next loop turn runs the jobs it unblocked).
      if (pending.size === 0) {
        promiseHandle.dispose();
        return { logs, error: 'Script is waiting on a promise that can never settle (no upstream call is running).' };
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        promiseHandle.dispose();
        return { logs, error: `Script timed out after ${timeoutMs} ms` };
      }
      await Promise.race([
        ...pending,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, remaining);
        }),
      ]);
      clearTimeout(timer);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A WASM trap leaves the shared module unusable for every later script; start a fresh one next time.
    if (/memory access out of bounds|unreachable|RuntimeError/i.test(message)) modulePromise = undefined;
    return { logs, error: formatError(message) };
  } finally {
    clearTimeout(timer);
    for (const d of deferreds) if (d.alive) d.dispose();
    vm.dispose();
  }
}
