import { callsVariant } from '../../lib/calls/index.ts';
import type { BenchService, BenchVariant } from '../../lib/types/index.ts';
import { calendarCalls } from './cases.ts';
import { BASE, DAV_ENV, resetCalendar, startRadicale } from './fixture.ts';
import { tasks } from './tasks.ts';

let stopRadicale: (() => Promise<void>) | undefined;

/** Both paths launch the same pinned dav-mcp against the same local server, with the same environment. */
const scenarios: BenchVariant = {
  id: 'scenarios',
  title: 'multi-step scenario tasks',
  direct: { server: 'calendar', command: 'npx', args: ['-y', 'dav-mcp@5.1.2'], env: DAV_ENV },
  codemodeEnv: DAV_ENV,
  systemPrompt:
    'You manage a calendar through the tools provided. Use only the calendar named in the task. Times are UTC. Complete the task, then reply with one short sentence.',
  notes: [
    'Both paths expose all 27 tools of the pinned `dav-mcp@5.1.2` (12 calendar, 8 contacts, 7 tasks). The benchmark only touches the calendar.',
    '`busiest-day` and `standup-hours` need many events read and counted; `free-slot` needs a free/busy calculation; `create-events` writes and is checked on the server afterwards.',
  ],
  tasks,
};

export const calendar: BenchService = {
  id: 'calendar',
  title: 'Calendar (dav-mcp over CalDAV)',
  warning:
    `Starts a throwaway Radicale CalDAV server on ${BASE} (127.0.0.1 only, data in bench/work/radicale/) with one fake account and a seeded calendar, ` +
    'and points the model at it. Needs `uvx` and `npx`, and port 5233 free. It never touches a real calendar or account.',
  notes: [
    'Pass/fail comes from the calendar server itself (events actually stored) or from values computed from the seed data, not from the model\'s claim.',
    'All times are UTC and the server runs with TZ=UTC, so zone-less times mean the same thing on both paths.',
    'Fully local: no cloud account, no real calendar data.',
  ],
  defaultVariant: 'scenarios',
  variants: [scenarios, callsVariant(scenarios, calendarCalls)],
  calls: calendarCalls,
  async preflight() {
    stopRadicale = await startRadicale();
    process.on('exit', () => void stopRadicale?.());
    await resetCalendar();
  },
};
