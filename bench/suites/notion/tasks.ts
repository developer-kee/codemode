import type { Task, Verdict } from '../../lib/types/index.ts';
import { clearSummary, expected, readSummary, seedWorkspace, ids } from './fixture.ts';

const fail = (detail: string): Verdict => ({ pass: false, detail });
const ok: Verdict = { pass: true, detail: 'ok' };

const hasNumber = (answer: string, value: number): boolean =>
  [...answer.replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].some((m) => Number(m[0]) === value);

/** The workspace is seeded once per benchmark run (preflight); each task only has to make sure it exists. */
async function ensureSeeded(): Promise<void> {
  if (!ids.root) await seedWorkspace();
}

const where =
  'The Notion workspace has a database titled "Bench Tasks" on a page whose title starts with "codemode bench". ' +
  'Each task has a Name, a Status (Todo, Doing or Done), a Priority number and an Owner. ';

export const tasks: Task[] = [
  {
    id: 'status-count',
    seeded: true,
    prompt:
      where +
      'How many tasks have the Status Done, and what is the highest Priority among the tasks whose Status is Doing? Reply with one short sentence.',
    prepare: ensureSeeded,
    async verify(answer) {
      if (!hasNumber(answer, expected.done)) return fail(`answer lacks Done count ${expected.done}: ${answer.slice(0, 100)}`);
      return hasNumber(answer, expected.maxPriorityDoing) ? ok : fail(`answer lacks top Doing priority ${expected.maxPriorityDoing}: ${answer.slice(0, 100)}`);
    },
  },
  {
    id: 'owner-load',
    seeded: true,
    prompt:
      where +
      'Which Owner has the most tasks that are not yet Done, and how many open tasks do they have? Reply with one short sentence.',
    prepare: ensureSeeded,
    async verify(answer) {
      if (!answer.includes(expected.busiestOwner)) return fail(`answer lacks ${expected.busiestOwner}: ${answer.slice(0, 100)}`);
      return hasNumber(answer, expected.busiestOwnerOpen) ? ok : fail(`answer lacks ${expected.busiestOwnerOpen}: ${answer.slice(0, 100)}`);
    },
  },
  {
    id: 'write-summary',
    seeded: true,
    prompt:
      where +
      'Create a new page titled "Summary" directly under the page whose title starts with "codemode bench". ' +
      'Put three paragraphs on it, one per Status, in the form "Todo: N", "Doing: N" and "Done: N", where N is the number of tasks with that Status. Reply with one short sentence.',
    async prepare() {
      await ensureSeeded();
      await clearSummary();
    },
    async verify() {
      const lines = await readSummary();
      if (!lines) return fail('no page titled Summary under the bench page');
      const want = { Todo: expected.todo, Doing: expected.doing, Done: expected.done };
      for (const [status, n] of Object.entries(want)) {
        const hit = lines.find((l) => new RegExp(`^${status}\\s*:\\s*(\\d+)\\s*$`, 'i').test(l.trim()));
        if (!hit) return fail(`no "${status}: N" paragraph (got ${JSON.stringify(lines).slice(0, 120)})`);
        if (Number(/(\d+)\s*$/.exec(hit.trim())?.[1]) !== n) return fail(`${status} is "${hit}", expected ${n}`);
      }
      return ok;
    },
  },
];
