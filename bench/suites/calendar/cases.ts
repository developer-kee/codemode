import type { CallDef } from '../../lib/types/index.ts';
import { CALENDAR_URL, readEvents, resetCalendar } from './fixture.ts';

/**
 * dav-mcp, one tool call at a time, against the seeded local CalDAV calendar. Tools that change or remove existing
 * items need an etag from an earlier read, which one call cannot supply, so they are skipped and the create-events
 * scenario covers writing instead.
 */
export const calendarCalls: CallDef = {
  reset: resetCalendar,
  cases: [
    {
      id: 'list_calendars',
      tool: 'list_calendars',
      args: {},
      prompt: 'List the calendars on the calendar server and tell me the name of each in one short sentence.',
      expect: /work/i,
    },
    {
      id: 'list_events',
      tool: 'list_events',
      args: { calendar_url: CALENDAR_URL, time_range_start: '2026-12-09T00:00:00Z', time_range_end: '2026-12-10T00:00:00Z' },
      prompt: `How many events are on 9 December 2026 (UTC) in the calendar at ${CALENDAR_URL}? Reply with one short sentence.`,
      expect: /\b4\b|four/i,
    },
    {
      id: 'calendar_query',
      tool: 'calendar_query',
      args: { calendar_url: CALENDAR_URL, summary_filter: 'Demo', limit: 5 },
      prompt: `In the calendar at ${CALENDAR_URL} find the event titled "Demo" on 9 December 2026 and tell me its start time in UTC, in one short sentence.`,
      expect: /14[:.]30|2:30\s?pm/i,
    },
    {
      id: 'freebusy_query',
      tool: 'freebusy_query',
      args: { time_range_start: '2026-12-09T09:00:00Z', time_range_end: '2026-12-09T17:00:00Z', calendar_url: CALENDAR_URL },
    },
    {
      id: 'create_event',
      tool: 'create_event',
      args: { calendar_url: CALENDAR_URL, summary: 'Bench event', start_date: '2026-12-29T10:00:00Z', end_date: '2026-12-29T11:00:00Z' },
      prompt:
        `In the calendar at ${CALENDAR_URL} create an event titled "Lunch" on 29 December 2026 from 12:00 to 13:00 UTC, then reply with one short sentence.`,
      async check() {
        const hits = (await readEvents()).filter((e) => e.summary === 'Lunch');
        if (hits.length !== 1) return { pass: false, detail: `${hits.length} events titled Lunch, expected 1` };
        const h = hits[0] as (typeof hits)[number];
        return h.start === '20261229T120000' && h.end === '20261229T130000'
          ? { pass: true, detail: 'ok' }
          : { pass: false, detail: `Lunch is ${h.start}-${h.end}, expected 20261229T120000-20261229T130000` };
      },
    },
    { id: 'list_todos', tool: 'list_todos', args: { calendar_url: CALENDAR_URL } },
    { id: 'list_addressbooks', tool: 'list_addressbooks', args: {} },
  ],
  skipped: [
    { tool: 'update_event', reason: 'Needs the etag from a previous read of the event.' },
    { tool: 'update_event_raw', reason: 'Needs the etag from a previous read of the event.' },
    { tool: 'delete_event', reason: 'Needs the etag from a previous read, and the event is gone after the first call.' },
    { tool: 'make_calendar', reason: 'Not repeatable: the calendar exists after the first call.' },
    { tool: 'update_calendar', reason: 'Changes the calendar everything else depends on.' },
    { tool: 'delete_calendar', reason: 'Deletes the calendar everything else depends on.' },
    { tool: 'calendar_multi_get', reason: 'Needs event URLs from a previous listing.' },
    { tool: 'list_contacts', reason: 'Contacts (CardDAV) are outside this calendar benchmark.' },
    { tool: 'create_contact', reason: 'Contacts (CardDAV) are outside this calendar benchmark.' },
    { tool: 'update_contact', reason: 'Contacts (CardDAV) are outside this calendar benchmark.' },
    { tool: 'update_contact_raw', reason: 'Contacts (CardDAV) are outside this calendar benchmark.' },
    { tool: 'delete_contact', reason: 'Contacts (CardDAV) are outside this calendar benchmark.' },
    { tool: 'addressbook_query', reason: 'Contacts (CardDAV) are outside this calendar benchmark.' },
    { tool: 'addressbook_multi_get', reason: 'Contacts (CardDAV) are outside this calendar benchmark.' },
    { tool: 'create_todo', reason: 'Tasks (VTODO) are outside this calendar benchmark.' },
    { tool: 'update_todo', reason: 'Tasks (VTODO) are outside this calendar benchmark.' },
    { tool: 'update_todo_raw', reason: 'Tasks (VTODO) are outside this calendar benchmark.' },
    { tool: 'delete_todo', reason: 'Tasks (VTODO) are outside this calendar benchmark.' },
    { tool: 'todo_query', reason: 'Tasks (VTODO) are outside this calendar benchmark.' },
    { tool: 'todo_multi_get', reason: 'Tasks (VTODO) are outside this calendar benchmark.' },
  ],
};
