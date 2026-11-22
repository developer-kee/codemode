import { delimiter } from 'node:path';
import type { ServiceConfig } from '../src/types.ts';

// The reference Filesystem server, https://github.com/modelcontextprotocol/servers (npm: @modelcontextprotocol/server-filesystem),
// pinned for reproducible results. It can only touch the directories it is started with.
//
// Directories come from CODEMODE_FILESYSTEM_DIRS (separated by ';' on Windows, ':' elsewhere); with none set it is
// confined to the directory the wrapper is started in. Keep that list as short as the job allows.
const dirs = (process.env['CODEMODE_FILESYSTEM_DIRS'] ?? '').split(delimiter).filter((d) => d.length > 0);

export default {
  name: 'filesystem',
  upstream: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem@2.4.0', ...(dirs.length > 0 ? dirs : [process.cwd()])],
  },
} satisfies ServiceConfig;
