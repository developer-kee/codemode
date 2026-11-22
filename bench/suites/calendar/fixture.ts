// A throwaway local CalDAV server (Radicale) with a deterministic calendar, for the Calendar benchmark.
// Binds to 127.0.0.1 only and keeps its data under bench/work/ (git-ignored).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PORT = 5233;
export const BASE = `http://127.0.0.1:${PORT}`;
export const USER = 'bench';
export const PASSWORD = 'benchpw';
/** Absolute URL of the seeded calendar. */
export const CALENDAR_URL = `${BASE}/${USER}/work/`;

/** Environment for the dav-mcp server, identical on both benchmark paths. TZ pins how zone-less times are read. */
export const DAV_ENV: Record<string, string> = {
  CALDAV_SERVER_URL: BASE,
  CALDAV_USERNAME: USER,
  CALDAV_PASSWORD: PASSWORD,
  TZ: 'UTC',
};

const workDir = fileURLToPath(new URL('../../work/radicale/', import.meta.url));
const auth = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;

// ---- deterministic seed ------------------------------------------------------------------------------------------
export interface SeedEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
}

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const at = (day: number, hour: number, minute: number): Date => new Date(Date.UTC(2026, 11, day, hour, minute));

function build(): SeedEvent[] {
  const rnd = lcg(2026);
  const titles = ['Standup', 'Review', '1:1', 'Planning', 'Demo', 'Standup'];
  const out: SeedEvent[] = [];
  let n = 0;
  const add = (summary: string, start: Date, minutes: number): void => {
    n++;
    out.push({ uid: `ev-${String(n).padStart(3, '0')}@codemode-bench`, summary, start, end: new Date(start.getTime() + minutes * 60_000) });
  };
  for (let day = 1; day <= 28; day++) {
    if (day === 9) continue; // hand-built below: the free-slot task needs a known gap
    const count = day === 14 ? 11 : 1 + Math.floor(rnd() * 3); // 14 December is clearly the busiest day
    for (let k = 0; k < count; k++) {
      const hour = 9 + Math.floor(rnd() * 8);
      const minute = rnd() < 0.5 ? 0 : 30;
      const minutes = [30, 60, 90][Math.floor(rnd() * 3)] as number;
      add(titles[Math.floor(rnd() * titles.length)] as string, at(day, hour, minute), minutes);
    }
  }
  // 9 December: busy 09:00-11:00, 11:15-13:00, 14:30-15:30. First free hour: 13:00-14:00 (so the answer is 13:00).
  add('Planning', at(9, 9, 0), 90);
  add('1:1', at(9, 10, 30), 30);
  add('Review', at(9, 11, 15), 105);
  add('Demo', at(9, 14, 30), 60);
  return out;
}

export const seed: SeedEvent[] = build();

const ics = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function toIcs(e: SeedEvent): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//codemode-bench//EN',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    'DTSTAMP:20261101T000000Z',
    `DTSTART:${ics(e.start)}`,
    `DTEND:${ics(e.end)}`,
    `SUMMARY:${e.summary}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// ---- expected answers for the tasks ---------------------------------------------------------------------------------
const day = (d: Date): number => d.getUTCDate();
const perDay = new Map<number, number>();
for (const e of seed) perDay.set(day(e.start), (perDay.get(day(e.start)) ?? 0) + 1);
const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] as [number, number];
/** The busiest December day and how many events fall on it. */
export const busiestDay = { day: busiest[0], count: busiest[1] };
/** Total length of all "Standup" events in hours. */
export const standupHours = seed.filter((e) => e.summary === 'Standup').reduce((n, e) => n + (e.end.getTime() - e.start.getTime()) / 3_600_000, 0);
export const standupCount = seed.filter((e) => e.summary === 'Standup').length;

// ---- CalDAV over fetch -------------------------------------------------------------------------------------------------
export async function dav(method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: auth, ...headers }, ...(body !== undefined ? { body } : {}) });
  return { status: res.status, text: await res.text() };
}

/** Delete and recreate the `work` calendar with the seed events. Takes about a second. */
export async function resetCalendar(): Promise<void> {
  await dav('DELETE', `/${USER}/work/`);
  const mk = await dav(
    'MKCALENDAR',
    `/${USER}/work/`,
    '<?xml version="1.0" encoding="utf-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>Work</d:displayname></d:prop></d:set></c:mkcalendar>',
    { 'Content-Type': 'application/xml' },
  );
  if (mk.status >= 300) throw new Error(`MKCALENDAR failed: ${mk.status} ${mk.text.slice(0, 200)}`);
  for (const e of seed) {
    const put = await dav('PUT', `/${USER}/work/${e.uid.split('@')[0]}.ics`, toIcs(e), { 'Content-Type': 'text/calendar; charset=utf-8' });
    if (put.status >= 300) throw new Error(`PUT ${e.uid} failed: ${put.status} ${put.text.slice(0, 200)}`);
  }
}

export interface StoredEvent {
  summary: string;
  /** Normalised to `YYYYMMDDTHHMMSS`, in the server's TZ (UTC in this benchmark). */
  start: string;
  end: string;
}

/** Read every event now stored in the `work` calendar. */
export async function readEvents(): Promise<StoredEvent[]> {
  const res = await dav('PROPFIND', `/${USER}/work/`, '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>', {
    Depth: '1',
    'Content-Type': 'application/xml',
  });
  const hrefs = [...res.text.matchAll(/<(?:\w+:)?href>([^<]+\.ics)<\/(?:\w+:)?href>/g)].map((m) => m[1] as string);
  const out: StoredEvent[] = [];
  for (const href of hrefs) {
    const body = (await dav('GET', href)).text.replace(/\r?\n[ \t]/g, '');
    const prop = (name: string): string => {
      const m = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'm').exec(body);
      return (m?.[1] ?? '').trim().replace(/\r$/, '');
    };
    const norm = (v: string): string => v.replace(/Z$/, '').replace(/[-:]/g, '');
    out.push({ summary: prop('SUMMARY'), start: norm(prop('DTSTART')), end: norm(prop('DTEND')) });
  }
  return out;
}

// ---- server lifecycle -----------------------------------------------------------------------------------------------------
let radicale: ChildProcess | undefined;

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE}/`, { method: 'OPTIONS', headers: { Authorization: auth } });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Radicale did not start on ${BASE} within 90 s`);
}

/** Start Radicale on 127.0.0.1 with one account and an empty store. Resolves with a function that stops it. */
export async function startRadicale(): Promise<() => Promise<void>> {
  // A server already answering here is not ours (a crashed earlier run, another program): using it would mix data.
  const stale = await fetch(`${BASE}/`, { method: 'OPTIONS' }).then(() => true, () => false);
  if (stale) throw new Error(`port ${PORT} is already in use. Stop whatever is listening there (Get-NetTCPConnection -LocalPort ${PORT}) and rerun.`);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(`${workDir}data`, { recursive: true });
  writeFileSync(`${workDir}users`, `${USER}:${PASSWORD}\n`);
  radicale = spawn(
    'uvx',
    [
      'radicale',
      '--server-hosts', `127.0.0.1:${PORT}`,
      '--storage-filesystem-folder', `${workDir}data`,
      '--auth-type', 'htpasswd',
      '--auth-htpasswd-filename', `${workDir}users`,
      '--auth-htpasswd-encryption', 'plain',
      '--logging-level', 'error',
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  const failed = new Promise<never>((_, reject) => {
    radicale?.once('error', (e) => reject(new Error(`could not start Radicale (is uvx installed?): ${String(e)}`)));
    radicale?.once('exit', (code) => reject(new Error(`Radicale exited early (code ${String(code)}); is port ${PORT} already in use?`)));
  });
  await Promise.race([waitForServer(), failed]);
  const child = radicale;
  return async () => {
    if (child?.pid !== undefined && child.exitCode === null) {
      // Stop only the process tree this module started. Synchronous so it also finishes inside a process 'exit' handler.
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
  };
}
