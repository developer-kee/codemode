// Worker-thread side of the sandbox. It runs one script at a time inside QuickJS and talks to the main thread only
// through two message channels: one for upstream tool calls (asynchronous) and one for the `store` (answered while this
// thread waits, so the guest sees a plain synchronous call). See `sandbox.ts` for the main-thread half.
import { parentPort, receiveMessageOnPort, type MessagePort } from 'node:worker_threads';
import { runInQuickJS } from './sandbox-core.ts';
import type { SandboxApi, SandboxLimits } from './types.ts';

interface RunMessage {
  type: 'run';
  code: string;
  namespace: string;
  ids: string[];
  limits: SandboxLimits;
  callPort: MessagePort;
  syncPort: MessagePort;
  flag: Int32Array;
}

/** How long a store call waits for the main thread before giving up (it answers in microseconds when it is alive). */
const SYNC_WAIT_MS = 10_000;

parentPort?.on('message', (msg: RunMessage) => {
  if (msg.type !== 'run') return;
  const { callPort, syncPort, flag } = msg;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let seq = 0;

  callPort.on('message', (reply: { n: number; ok: boolean; value?: unknown; message?: string }) => {
    const p = pending.get(reply.n);
    if (!p) return;
    pending.delete(reply.n);
    if (reply.ok) p.resolve(reply.value);
    else p.reject(new Error(reply.message ?? 'tool error'));
  });

  const api: SandboxApi = {
    namespace: msg.namespace,
    ids: msg.ids,
    callTool: (id, input) =>
      new Promise((resolve, reject) => {
        const n = ++seq;
        pending.set(n, { resolve, reject });
        callPort.postMessage({ n, id, input });
      }),
    syncCall: (id, input) => {
      Atomics.store(flag, 0, 0);
      syncPort.postMessage({ id, input });
      if (Atomics.wait(flag, 0, 0, SYNC_WAIT_MS) === 'timed-out') throw new Error('The host did not answer a store call');
      const reply = receiveMessageOnPort(syncPort)?.message as
        | { handled: false }
        | { handled: true; value: unknown }
        | { error: string }
        | undefined;
      if (!reply) throw new Error('The host sent no answer to a store call');
      if ('error' in reply) throw new Error(reply.error);
      return reply;
    },
  };

  void runInQuickJS(msg.code, api, msg.limits).then((result) => {
    // Same channel as the tool calls, so the host sees every call the script started before it sees the end.
    callPort.postMessage({ done: true, result });
    callPort.close();
    syncPort.close();
  });
});
