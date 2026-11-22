// OAuth for upstreams that only offer a browser sign-in (for example Notion's hosted MCP server).
//
// Two parts:
//  - `FileOAuthProvider` is what the running wrapper uses. It holds the client registration and tokens in one file
//    per service, outside the repo, and lets the SDK refresh them. It never opens a browser: when the sign-in is
//    missing or has expired it stops with a message that names the command to run.
//  - `login` is the one-time sign-in (`npm run login -- <service>`): browser, localhost callback, tokens saved.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { assertSecureUrl, guardedFetch } from './upstream.ts';

export const DEFAULT_REDIRECT_PORT = 33417;

/** Where sign-ins are kept: the user's profile, never the repo. `CODEMODE_AUTH_DIR` overrides it. */
export function authDir(): string {
  const override = process.env['CODEMODE_AUTH_DIR'];
  if (override) return override;
  if (process.platform === 'win32') {
    return join(process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), 'codemode', 'oauth');
  }
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'codemode', 'oauth');
}

/** What is written to disk. The PKCE verifier and state live in memory only. */
interface Saved {
  serverUrl: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
}

export interface OAuthOptions {
  /** Service name; picks the file. Letters, digits, `_` and `-` only. */
  service: string;
  serverUrl: string;
  redirectPort?: number;
  /** Set only by `login`. Without it the provider cannot start a browser sign-in. */
  onAuthorize?: (url: URL) => void | Promise<void>;
}

export class FileOAuthProvider implements OAuthClientProvider {
  readonly #service: string;
  readonly #serverUrl: string;
  readonly #port: number;
  readonly #onAuthorize: ((url: URL) => void | Promise<void>) | undefined;
  #verifier = '';
  #state = '';

  constructor(options: OAuthOptions) {
    if (!/^[a-z0-9_-]+$/i.test(options.service)) throw new Error(`Invalid service name "${options.service}"`);
    this.#service = options.service;
    this.#serverUrl = options.serverUrl;
    this.#port = options.redirectPort ?? Number(process.env['CODEMODE_OAUTH_PORT'] ?? DEFAULT_REDIRECT_PORT);
    this.#onAuthorize = options.onAuthorize;
  }

  get file(): string {
    return join(authDir(), `${this.#service}.json`);
  }

  /** The `state` sent to the authorization server; the callback must return the same value. */
  get expectedState(): string {
    return this.#state;
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.#port}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'codemode',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  #load(): Saved {
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Saved;
      // A sign-in is only valid for the server it was made with.
      if (saved.serverUrl === this.#serverUrl) return saved;
    } catch {
      // No file yet, or unreadable: treated as signed out.
    }
    return { serverUrl: this.#serverUrl };
  }

  #save(saved: Saved): void {
    mkdirSync(authDir(), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(saved, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  state(): string {
    this.#state = randomBytes(24).toString('base64url');
    return this.#state;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const client = this.#load().client;
    // A registration made for another callback port cannot be used with this one.
    const uris = (client as { redirect_uris?: string[] } | undefined)?.redirect_uris;
    return client !== undefined && uris?.includes(this.redirectUrl) === true ? client : undefined;
  }

  saveClientInformation(client: OAuthClientInformationMixed): void {
    this.#save({ ...this.#load(), client });
  }

  tokens(): OAuthTokens | undefined {
    return this.#load().tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.#save({ ...this.#load(), tokens });
  }

  saveCodeVerifier(verifier: string): void {
    this.#verifier = verifier;
  }

  codeVerifier(): string {
    return this.#verifier;
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    if (!this.#onAuthorize) {
      throw new Error(`${this.#service} is not signed in, or its sign-in has expired. Run: npm run login -- ${this.#service}`);
    }
    await this.#onAuthorize(url);
  }

  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    const saved = this.#load();
    if (scope === 'all' || scope === 'client') delete saved.client;
    if (scope === 'all' || scope === 'tokens') delete saved.tokens;
    if (scope === 'all' || scope === 'verifier') this.#verifier = '';
    this.#save(saved);
  }
}

/** Open a URL in the default browser without going through a shell. */
function openBrowser(url: URL): void {
  const [command, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url.href]]
      : process.platform === 'darwin'
        ? ['open', [url.href]]
        : ['xdg-open', [url.href]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => undefined); // the URL is also printed, so a missing opener is not fatal
  child.unref();
}

export interface LoginOptions {
  service: string;
  serverUrl: string;
  port?: number;
  /** Replaces the default browser opener (tests). */
  open?: (url: URL) => void | Promise<void>;
  log?: (message: string) => void;
  timeoutMs?: number;
}

/** Sign in once and save the tokens. Returns the number of tools the upstream offers, as proof it worked. */
export async function login(options: LoginOptions): Promise<number> {
  const log = options.log ?? ((m: string) => console.error(m));
  const serverUrl = assertSecureUrl(options.serverUrl);
  const port = options.port ?? Number(process.env['CODEMODE_OAUTH_PORT'] ?? DEFAULT_REDIRECT_PORT);
  const open = options.open ?? openBrowser;

  const onAuthorize = async (url: URL): Promise<void> => {
    log(`Sign in at:\n${url.href}`);
    await open(url);
  };
  const provider = new FileOAuthProvider({ service: options.service, serverUrl: serverUrl.href, redirectPort: port, onAuthorize });

  // Listen first so a busy port fails before anything is registered.
  let settle: { resolve: (code: string) => void; reject: (e: Error) => void } | undefined;
  const code = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  code.catch(() => undefined);
  const callback = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get('error');
    const returned = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (error !== null) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end(`Sign-in failed: ${error}`);
      settle?.reject(new Error(`The server refused the sign-in: ${error}`));
    } else if (returned === null || state !== provider.expectedState) {
      // Wrong or missing state: someone else's request, not the one we started. Ignore it and keep waiting.
      res.writeHead(400, { 'content-type': 'text/plain' }).end('Unexpected callback.');
    } else {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('Signed in. You can close this tab.');
      settle?.resolve(returned);
    }
  });
  await new Promise<void>((resolve, reject) => {
    callback.once('error', reject);
    callback.listen(port, '127.0.0.1', resolve);
  });
  const timer = setTimeout(() => settle?.reject(new Error('Timed out waiting for the browser sign-in.')), options.timeoutMs ?? 300_000);

  try {
    const transport = new StreamableHTTPClientTransport(serverUrl, { authProvider: provider, fetch: guardedFetch });
    try {
      await new Client({ name: 'codemode', version: '0.1.0' }).connect(transport);
      log('Already signed in.');
    } catch (e) {
      if (!(e instanceof UnauthorizedError)) throw e;
      await transport.finishAuth(await code);
    }
    // Prove the saved tokens work with a fresh connection.
    const client = new Client({ name: 'codemode', version: '0.1.0' });
    await client.connect(new StreamableHTTPClientTransport(serverUrl, { authProvider: provider, fetch: guardedFetch }));
    const tools = (await client.listTools()).tools.length;
    await client.close();
    return tools;
  } finally {
    clearTimeout(timer);
    callback.close();
  }
}
