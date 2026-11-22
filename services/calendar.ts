import type { ServiceConfig } from '../src/types.ts';

// Calendar, contacts and tasks over CalDAV/CardDAV via https://www.npmjs.com/package/dav-mcp (27 tools), pinned for
// reproducible results. Works with any CalDAV server: Nextcloud, iCloud, Fastmail, Radicale, ...
//
// Credentials are read by the server itself from the environment, so set them in the MCP client config `env`
// (never in this repo):
//   CALDAV_SERVER_URL=https://dav.example.com  CALDAV_USERNAME=...  CALDAV_PASSWORD=...
// Times without a zone are read in the zone the server runs in; set TZ explicitly (the benchmark uses UTC).
//
// This wrapper can create, change and delete events. Restrict it with `access` (or `--read-only`) if it should only look.
export default {
  name: 'calendar',
  upstream: { command: 'npx', args: ['-y', 'dav-mcp@5.1.2'] },
} satisfies ServiceConfig;
