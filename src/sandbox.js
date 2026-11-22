import { newQuickJSAsyncWASMModule, shouldInterruptAfterDeadline } from 'quickjs-emscripten';
import { transform } from 'sucrase';

let modulePromise;
const getModule = () => (modulePromise ??= newQuickJSAsyncWASMModule());

/** Strip TypeScript syntax so the model may write either TS or JS. */
export function stripTypes(code) {
  return transform(code, { transforms: ['typescript'] }).code;
}

/**
 * Run model-written code in a QuickJS (WASM) sandbox.
 *
 * The guest has no fetch, no fs, no network, no process: the only way out is
 * the `namespace` object, whose functions call back into `callTool`.
 *
 * @param {string} code  TypeScript/JavaScript; may use top-level await and `return`.
 * @param {{ namespace: string, ids: string[], callTool: (id: string, input: any) => Promise<any> }} api
 * @param {{ timeoutMs?: number, memoryBytes?: number, maxLogChars?: number }} [limits]
 * @returns {Promise<{ logs: string[], result?: any, error?: string }>}
 */
export async function runInSandbox(code, api, limits = {}) {
  const { timeoutMs = 60_000, memoryBytes = 128 * 1024 * 1024, maxLogChars = 100_000 } = limits;
  const QuickJS = await getModule();
  const vm = QuickJS.newContext(); // owns its runtime; disposing vm frees both
  const runtime = vm.runtime;
  runtime.setMemoryLimit(memoryBytes);
  runtime.setMaxStackSize(1024 * 1024);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));

  const logs = [];
  let logChars = 0;
  const pushLog = (line) => {
    if (logChars > maxLogChars) return;
    logChars += line.length;
    logs.push(logChars > maxLogChars ? line.slice(0, 200) + ' …[log truncated]' : line);
  };

  try {
    // console.* -> logs
    const consoleObj = vm.newObject();
    for (const level of ['log', 'info', 'warn', 'error']) {
      const fn = vm.newFunction(level, (...args) => {
        const text = args
          .map((h) => {
            const v = vm.dump(h);
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

    // host bridge: __call(id, jsonInput) -> jsonResult (string)
    const bridge = vm.newAsyncifiedFunction('__call', async (idH, inputH) => {
      const id = vm.getString(idH);
      const input = JSON.parse(vm.getString(inputH));
      try {
        const out = await api.callTool(id, input);
        return vm.newString(JSON.stringify(out === undefined ? null : out));
      } catch (e) {
        return { error: vm.newError(String(e?.message ?? e)) };
      }
    });
    vm.setProp(vm.global, '__call', bridge);
    bridge.dispose();

    const ids = JSON.stringify(api.ids);
    const prelude = `
      globalThis.${api.namespace} = {};
      for (const id of ${ids}) {
        globalThis.${api.namespace}[id] = async (input) => JSON.parse(__call(id, JSON.stringify(input ?? {})));
      }
    `;
    vm.unwrapResult(vm.evalCode(prelude)).dispose();

    const js = stripTypes(`(async () => {\n${code}\n})()`);
    const evalResult = await vm.evalCodeAsync(js);
    const promiseHandle = vm.unwrapResult(evalResult);

    // Drive the promise to completion.
    const settled = vm.resolvePromise(promiseHandle);
    promiseHandle.dispose();
    const pump = setInterval(() => {
      try {
        runtime.executePendingJobs();
      } catch {
        /* surfaced via the promise */
      }
    }, 1);
    let resolved;
    try {
      resolved = await settled;
    } finally {
      clearInterval(pump);
    }
    runtime.executePendingJobs();

    if (resolved.error) {
      const err = vm.dump(resolved.error);
      resolved.error.dispose();
      return { logs, error: formatError(err) };
    }
    const value = vm.dump(resolved.value);
    resolved.value.dispose();
    return { logs, result: value };
  } catch (e) {
    return { logs, error: formatError(e?.message ?? e) };
  } finally {
    vm.dispose();
  }
}

function formatError(err) {
  if (err && typeof err === 'object') {
    const msg = err.message ?? JSON.stringify(err);
    return err.stack ? `${err.name ?? 'Error'}: ${msg}\n${err.stack}` : String(msg);
  }
  return String(err);
}
