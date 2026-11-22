// OAuth sign-in against a fake server that follows the same discovery, registration, PKCE and refresh steps
// Notion's hosted server advertises. No browser: the "browser" is a fetch that follows the redirect.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { FileOAuthProvider, login } from '../src/oauth.ts';
import { connectUpstream, listAllTools } from '../src/upstream.ts';

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

let server: Server;
let base = '';
let accessToken = 'at-1';
let refreshes = 0;
let authDir = '';

before(async () => {
  authDir = mkdtempSync(join(tmpdir(), 'codemode-oauth-'));
  process.env['CODEMODE_AUTH_DIR'] = authDir;
  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', base);
      const json = (status: number, body: unknown, headers: Record<string, string> = {}): void => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
      };
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
        return json(200, { resource: base, authorization_servers: [base], scopes_supported: ['default'] });
      }
      if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) {
        return json(200, {
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_methods_supported: ['none'],
          code_challenge_methods_supported: ['S256'],
        });
      }
      if (url.pathname === '/register') {
        const meta = JSON.parse(await readBody(req)) as Record<string, unknown>;
        return json(201, { ...meta, client_id: 'client-1' });
      }
      if (url.pathname === '/authorize') {
        assert.ok(url.searchParams.get('code_challenge'), 'PKCE challenge is sent');
        const back = new URL(url.searchParams.get('redirect_uri') ?? '');
        back.searchParams.set('code', 'code-1');
        back.searchParams.set('state', url.searchParams.get('state') ?? '');
        res.writeHead(302, { location: back.href }).end();
        return;
      }
      if (url.pathname === '/token') {
        const form = new URLSearchParams(await readBody(req));
        if (form.get('grant_type') === 'authorization_code') {
          assert.ok(form.get('code_verifier'), 'PKCE verifier is sent');
          return json(200, { access_token: accessToken, token_type: 'Bearer', refresh_token: 'rt-1', expires_in: 3600 });
        }
        if (form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'rt-1') {
          refreshes++;
          accessToken = `at-${refreshes + 1}`;
          return json(200, { access_token: accessToken, token_type: 'Bearer', refresh_token: 'rt-1', expires_in: 3600 });
        }
        return json(400, { error: 'invalid_grant' });
      }
      if (url.pathname === '/mcp') {
        if (req.headers.authorization !== `Bearer ${accessToken}`) {
          return json(401, { error: 'unauthorized' }, {
            'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
          });
        }
        if (req.method !== 'POST') {
          res.writeHead(405).end();
          return;
        }
        const mcp = new McpServer({ name: 'fake-hosted', version: '1.0.0' });
        mcp.registerTool('whoami', { description: 'Who am I', inputSchema: { x: z.number().optional() } }, () => ({
          content: [{ type: 'text', text: '{}' }],
        }));
        // Stateless mode: the option is typed as required but undefined is how the SDK asks for it.
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
        await mcp.connect(transport);
        await transport.handleRequest(req, res, JSON.parse(await readBody(req)));
        return;
      }
      res.writeHead(404).end();
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  server.close();
  server.closeAllConnections();
  rmSync(authDir, { recursive: true, force: true });
  delete process.env['CODEMODE_AUTH_DIR'];
});

test('without a saved sign-in the wrapper stops and names the login command', async () => {
  await assert.rejects(
    connectUpstream({ url: `${base}/mcp`, oauth: { service: 'fake-hosted' } }),
    /Run: npm run login -- fake-hosted/,
  );
});

test('login saves tokens; the wrapper then connects, and refreshes an expired token by itself', async () => {
  const port = await freePort();
  const tools = await login({
    service: 'fake-hosted',
    serverUrl: `${base}/mcp`,
    port,
    open: (u) => void fetch(u),
    log: () => undefined,
  });
  assert.equal(tools, 1);

  const saved = JSON.parse(readFileSync(join(authDir, 'fake-hosted.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(saved['serverUrl'], `${base}/mcp`);
  assert.ok(saved['tokens'] && saved['client']);
  assert.equal('verifier' in saved, false, 'the PKCE verifier is never written to disk');

  const client = await connectUpstream({ url: `${base}/mcp`, oauth: { service: 'fake-hosted' } });
  assert.deepEqual((await listAllTools(client)).map((t) => t.name), ['whoami']);
  await client.close();

  // The server stops accepting the saved access token; the SDK must use the refresh token, no browser involved.
  accessToken = 'rotated-by-server';
  const again = await connectUpstream({ url: `${base}/mcp`, oauth: { service: 'fake-hosted' } });
  assert.equal((await listAllTools(again)).length, 1);
  await again.close();
  assert.equal(refreshes, 1);
});

test('a saved sign-in is ignored for a different server', () => {
  const other = new FileOAuthProvider({ service: 'fake-hosted', serverUrl: 'https://elsewhere.example/mcp' });
  assert.equal(other.tokens(), undefined);
  assert.equal(other.clientInformation(), undefined);
});

test('the service name cannot escape the sign-in folder', () => {
  assert.throws(() => new FileOAuthProvider({ service: '../evil', serverUrl: 'https://x.example' }), /Invalid service name/);
});
