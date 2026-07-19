import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const CALLBACK_PATH = '/callback';
const PREFERRED_PORT = 8085;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1_000;
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

export interface ConsentUrlOptions {
  clientId: string;
  port: number;
  state: string;
}

interface TokenResponse {
  refresh_token?: unknown;
}

export function buildConsentUrl({ clientId, port, state }: ConsentUrlOptions): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `http://localhost:${port}${CALLBACK_PATH}`,
    response_type: 'code',
    scope: YOUTUBE_UPLOAD_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();
  return url.toString();
}

export function upsertEnvLine(content: string, key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineWhitespace = '[^\\S\\r\\n]*';
  const existingLine = new RegExp(
    `^${lineWhitespace}#?${lineWhitespace}${escapedKey}=.*$`,
    'm',
  );
  const replacement = `${key}=${value}`;

  if (existingLine.test(content)) {
    return content.replace(existingLine, () => replacement);
  }

  if (content === '') return replacement;

  const trailingNewline = content.match(/(\r\n|\n|\r)$/)?.[0];
  if (trailingNewline) {
    return `${content}${replacement}${trailingNewline}`;
  }

  const lineEnding = content.match(/\r\n|\n|\r/)?.[0] ?? '\n';
  return `${content}${lineEnding}${replacement}`;
}

function requiredYouTubeClientEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const missing = [
    ...(clientId == null || clientId.trim() === '' ? ['YOUTUBE_CLIENT_ID'] : []),
    ...(clientSecret == null || clientSecret.trim() === '' ? ['YOUTUBE_CLIENT_SECRET'] : []),
  ];

  if (missing.length > 0) {
    throw new Error(
      `Missing required env for YouTube OAuth: ${missing.join(', ')}. ` +
        'Create an OAuth client (Desktop app, or Web with a loopback redirect) at ' +
        'https://console.cloud.google.com/apis/credentials, enable the YouTube Data API v3, ' +
        `and, for Web clients, authorize http://localhost:${PREFERRED_PORT}${CALLBACK_PATH}.`,
    );
  }

  return { clientId: clientId!, clientSecret: clientSecret! };
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      cleanup();
      reject(error);
    };
    const onListening = (): void => {
      cleanup();
      const address = server.address() as AddressInfo | null;
      if (!address) {
        reject(new Error('OAuth callback server started without a local address'));
        return;
      }
      resolve(address.port);
    };
    const cleanup = (): void => {
      server.off('error', onError);
      server.off('listening', onListening);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}

async function listenWithFallback(server: Server): Promise<number> {
  try {
    return await listen(server, PREFERRED_PORT);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    console.warn(
      `Port ${PREFERRED_PORT} is in use; using a random free port. ` +
        'Random callback ports require a Desktop-type OAuth client.',
    );
    return listen(server, 0);
  }
}

function writeHtml(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head>' +
      `<body><p>${message}</p></body></html>`,
  );
}

function waitForAuthorizationCode(server: Server, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      finish(
        new Error('Timed out after 5 minutes waiting for a valid YouTube OAuth callback.'),
      );
    }, CALLBACK_TIMEOUT_MS);

    const finish = (error?: Error, code?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      if (error) reject(error);
      else resolve(code!);
    };

    server.on('request', (request, response) => {
      if (request.method !== 'GET' || request.url == null) {
        response.writeHead(404).end();
        return;
      }

      const callback = new URL(request.url, 'http://localhost');
      if (callback.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end();
        return;
      }

      if (callback.searchParams.get('state') !== expectedState) {
        writeHtml(response, 400, 'Invalid authorization state. Return to the terminal and try again.');
        return;
      }

      const oauthError = callback.searchParams.get('error');
      if (oauthError === 'access_denied') {
        writeHtml(response, 400, 'Authorization declined — you can close this tab.');
        finish(new Error('YouTube authorization was declined. No credentials were changed.'));
        return;
      }
      if (oauthError != null) {
        writeHtml(response, 400, 'Authorization failed — you can close this tab.');
        finish(new Error('Google returned an OAuth error. No credentials were changed.'));
        return;
      }

      const code = callback.searchParams.get('code');
      if (code == null || code === '') {
        writeHtml(response, 400, 'Missing authorization code. Return to the terminal and try again.');
        return;
      }

      writeHtml(response, 200, 'Authorized — you can close this tab.');
      finish(undefined, code);
    });
  });
}

function openConsentPage(url: string): void {
  const child = spawn('open', [url], { detached: true, stdio: 'ignore' });
  child.once('error', () => {
    console.warn('Could not open a browser automatically; use the printed consent URL.');
  });
  child.unref();
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<string> {
  console.log(`Authorization code received (${code.length} chars; value hidden).`);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `YouTube token exchange failed with HTTP ${response.status}; response body suppressed.`,
    );
  }

  let payload: TokenResponse;
  try {
    payload = (await response.json()) as TokenResponse;
  } catch {
    throw new Error('YouTube token exchange returned invalid JSON; response body suppressed.');
  }

  if (typeof payload.refresh_token !== 'string' || payload.refresh_token === '') {
    throw new Error(
      'YouTube token exchange returned no refresh_token. A prior grant without prompt=consent ' +
        'can suppress it; revoke this app at https://myaccount.google.com/permissions and rerun.',
    );
  }

  console.log(`Refresh token received (${payload.refresh_token.length} chars; value hidden).`);
  return payload.refresh_token;
}

function writeRefreshToken(refreshToken: string): void {
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const envPath = join(repoRoot, '.env');
  const backupPath = join(repoRoot, '.env.bak');
  const hadEnv = existsSync(envPath);
  const content = hadEnv ? readFileSync(envPath, 'utf8') : '';

  if (hadEnv) {
    copyFileSync(envPath, backupPath);
  } else {
    console.log('.env does not exist; creating it and skipping the backup.');
  }

  writeFileSync(
    envPath,
    upsertEnvLine(content, 'YOUTUBE_REFRESH_TOKEN', refreshToken),
    'utf8',
  );

  const backupNote = hadEnv ? 'backup at .env.bak' : 'no backup (new .env)';
  console.log(
    `✅ YOUTUBE_REFRESH_TOKEN written to .env (${refreshToken.length} chars); ${backupNote}`,
  );
}

async function main(): Promise<void> {
  const { clientId, clientSecret } = requiredYouTubeClientEnv();
  const force = process.argv.includes('--force');
  const existingRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (existingRefreshToken != null && existingRefreshToken.trim() !== '' && !force) {
    throw new Error(
      'YOUTUBE_REFRESH_TOKEN is already set; refusing to overwrite it. Rerun with --force to replace it.',
    );
  }

  const state = randomBytes(32).toString('hex');
  const server = createServer();
  let port: number;
  try {
    port = await listenWithFallback(server);
  } catch (error) {
    server.close();
    throw error;
  }

  const authorizationCode = waitForAuthorizationCode(server, state);
  const redirectUri = `http://localhost:${port}${CALLBACK_PATH}`;
  const consentUrl = buildConsentUrl({ clientId, port, state });
  console.log('Open this Google consent URL if the browser does not open automatically:');
  console.log(consentUrl);
  openConsentPage(consentUrl);

  const code = await authorizationCode;
  const refreshToken = await exchangeCode(code, clientId, clientSecret, redirectUri);
  writeRefreshToken(refreshToken);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown YouTube OAuth failure';
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  });
}
