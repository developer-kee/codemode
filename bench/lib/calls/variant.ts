// Model-driven per-call variant: one task per upstream tool call.
import type { BenchVariant, CallDef, Task, Verdict } from '../types/index.ts';

/** The `calls` variant of a service: one task per case that has a prompt, on the same upstream setup as `base`. */
export function callsVariant(base: BenchVariant, def: CallDef): BenchVariant {
  const tasks: Task[] = def.cases
    .filter((c) => c.prompt !== undefined && (c.expect !== undefined || c.check !== undefined))
    .map((c) => ({
      id: c.id,
      prompt: c.prompt ?? '',
      seeded: true,
      prepare: () => def.reset(),
      async verify(answer: string): Promise<Verdict> {
        if (c.check) return c.check(answer);
        return c.expect?.test(answer)
          ? { pass: true, detail: 'ok' }
          : { pass: false, detail: `answer did not match ${String(c.expect)}: ${answer.slice(0, 80)}` };
      },
    }));
  return {
    ...base,
    id: 'calls',
    title: 'one tool call per task',
    notes: [
      `Each task asks for exactly one upstream tool call (${tasks.length} of ${def.cases.length} cases have a model prompt), so no single tool can dominate the totals and each tool is visible on its own row.`,
      'Same cases as the deterministic latency benchmark (`npm run bench:calls`), so a tool can be followed from definition cost, to raw latency, to model tokens.',
      ...base.notes,
    ],
    tasks,
  };
}
