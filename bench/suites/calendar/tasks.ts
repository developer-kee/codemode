import type { Task, Verdict } from '../../lib/types/index.ts';
import { busiestDay, CALENDAR_URL, readEvents, resetCalendar, standupCount, standupHours } from './fixture.ts';

const fail = (detail: string): Verdict => ({ pass: false, detail });
const ok: Verdict = { pass: true, detail: 'ok' };

/** True when the answer contains a number within `tol` of `value`. */
function hasNumber(answer: string, value: number, tol = 0.01): boolean {
  return [...answer.replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].some((m) => Math.abs(Number(m[0]) - value) <= tol);
}

export const tasks: Task[] = [
  {
    id: 'busiest-day',
    seeded: true,
    prompt:
      `The calendar at ${CALENDAR_URL} (called Work) holds the events of December 2026, all in UTC. ` +
      'Which single day of December has the most events, and how many events does it have? Reply with one short sentence.',
    async prepare() {
      await resetCalendar();
    },
    async verify(answer) {
      const dayOk = new RegExp(`(^|[^\\d])${busiestDay.day}(st|nd|rd|th)?([^\\d]|$)`).test(answer);
      if (!dayOk) return fail(`answer lacks day ${busiestDay.day}: ${answer.slice(0, 100)}`);
      return hasNumber(answer, busiestDay.count, 0) ? ok : fail(`answer lacks count ${busiestDay.count}: ${answer.slice(0, 100)}`);
    },
  },
  {
    id: 'standup-hours',
    seeded: true,
    prompt:
      `The calendar at ${CALENDAR_URL} (called Work) holds the events of December 2026. ` +
      'Add up the lengths of all events titled exactly "Standup" and tell me the total in hours as a decimal number, ' +
      'and how many Standup events there are. Reply with one short sentence.',
    async prepare() {
      await resetCalendar();
    },
    async verify(answer) {
      if (!hasNumber(answer, standupHours)) return fail(`answer lacks ${standupHours} hours: ${answer.slice(0, 100)}`);
      return hasNumber(answer, standupCount, 0) ? ok : fail(`answer lacks count ${standupCount}: ${answer.slice(0, 100)}`);
    },
  },
  {
    id: 'free-slot',
    seeded: true,
    prompt:
      `In the calendar at ${CALENDAR_URL} (called Work), find the earliest one-hour gap on 9 December 2026 between 09:00 and 17:00 UTC ` +
      'in which no event is scheduled. Reply with one short sentence that gives the start time as HH:MM.',
    async prepare() {
      await resetCalendar();
    },
    async verify(answer) {
      return /\b13[:.]00\b/.test(answer) ? ok : fail(`answer lacks 13:00: ${answer.slice(0, 100)}`);
    },
  },
  {
    id: 'create-events',
    seeded: true,
    prompt:
      `In the calendar at ${CALENDAR_URL} (called Work) create three events, all times in UTC: "Offsite" on 30 December 2026 from 10:00 to 12:00, ` +
      '"Dentist" on 30 December 2026 from 14:00 to 15:00, and "Retro" on 31 December 2026 from 09:00 to 10:00. Reply with one short sentence.',
    async prepare() {
      await resetCalendar();
    },
    async verify() {
      const events = await readEvents();
      const want = [
        { summary: 'Offsite', start: '20261230T100000', end: '20261230T120000' },
        { summary: 'Dentist', start: '20261230T140000', end: '20261230T150000' },
        { summary: 'Retro', start: '20261231T090000', end: '20261231T100000' },
      ];
      for (const w of want) {
        const hits = events.filter((e) => e.summary === w.summary);
        if (hits.length !== 1) return fail(`${hits.length} events titled ${w.summary}, expected 1`);
        const h = hits[0] as (typeof events)[number];
        if (h.start !== w.start || h.end !== w.end) return fail(`${w.summary} is ${h.start}-${h.end}, expected ${w.start}-${w.end}`);
      }
      return ok;
    },
  },
];
