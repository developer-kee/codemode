import {
  newQuickJSAsyncWASMModule,
  shouldInterruptAfterDeadline,
  type QuickJSAsyncWASMModule,
} from 'quickjs-emscripten';
import { transform } from 'sucrase';
import type { SandboxApi, SandboxLimits, SandboxResult } from './types.ts';

let modulePromise: Promise<QuickJSAsyncWASMModule> | undefined;
const getModule = (): Promise<QuickJSAsyncWASMModule> => (modulePromise ??= newQuickJSAsyncWASMModule());

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
 * The guest has no fetch, fs, network or process: the only way out is the
 * `api.namespace` object, whose functions call back into `api.callTool`.
 * The code may use top-level await and `return`.
 */
export async function runInSandbox(
  code: string,
  api: SandboxApi,
  limits: SandboxLimits = {},
): Promise<SandboxResult> {
  const { timeoutMs = 60_000, memoryBytes = 128 * 1024 * 1024, maxLogChars = 100_000 } = limits;
  const QuickJS = await getModule();
  const vm = QuickJS.newContext(); // owns its runtime; disposing vm frees both
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

    // Host bridge: __call(id, jsonInput) -> jsonResult (string).
    const bridge = vm.newAsyncifiedFunction('__call', async (idH, inputH) => {
      if (!idH || !inputH) return { error: vm.newError('__call needs (id, json)') };
      const id = vm.getString(idH);
      const input: unknown = JSON.parse(vm.getString(inputH));
      try {
        const out = await api.callTool(id, input);
        return vm.newString(JSON.stringify(out ?? null));
      } catch (e) {
        return { error: vm.newError(e instanceof Error ? e.message : String(e)) };
      }
    });
    vm.setProp(vm.global, '__call', bridge);
    bridge.dispose();

    const prelude = `
      globalThis.${api.namespace} = {};
      for (const id of ${JSON.stringify(api.ids)}) {
        globalThis.${api.namespace}[id] = async (input) => JSON.parse(__call(id, JSON.stringify(input ?? {})));
      }
      // store: persists across scripts; the host handles the reserved "__store.*" ids.
      globalThis.store = {
        get(key) {
          const r = JSON.parse(__call('__store.get', JSON.stringify({ key })));
          return r.found ? JSON.parse(r.json) : undefined;
        },
        set(key, value) {
          __call('__store.set', JSON.stringify({ key, json: JSON.stringify(value) }));
        },
        delete(key) {
          return JSON.parse(__call('__store.delete', JSON.stringify({ key })));
        },
        keys() {
          return JSON.parse(__call('__store.keys', '{}'));
        },
      };
    `;
    vm.unwrapResult(vm.evalCode(prelude)).dispose();

    const js = stripTypes(`(async () => {\n${code}\n})()`);
    const promiseHandle = vm.unwrapResult(await vm.evalCodeAsync(js));

    // Drive the guest promise to completion.
    const settled = vm.resolvePromise(promiseHandle);
    promiseHandle.dispose();
    const pump = setInterval(() => {
      try {
        runtime.executePendingJobs();
      } catch {
        /* surfaced via the promise */
      }
    }, 1);
    let resolved: Awaited<typeof settled>;
    try {
      resolved = await settled;
    } finally {
      clearInterval(pump);
    }
    runtime.executePendingJobs();

    if (resolved.error !== undefined) {
      const err: unknown = vm.dump(resolved.error);
      resolved.error.dispose();
      return { logs, error: formatError(err) };
    }
    if (resolved.value === undefined) return { logs };
    const value: unknown = vm.dump(resolved.value);
    resolved.value.dispose();
    return { logs, result: value };
  } catch (e) {
    return { logs, error: formatError(e instanceof Error ? e.message : e) };
  } finally {
    vm.dispose();
  }
}
