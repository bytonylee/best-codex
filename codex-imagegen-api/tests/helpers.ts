import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbwAAAABJRU5ErkJggg==';

export async function makeTempDir(prefix = 'imagegen-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function toBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function makeJwt(payload: Record<string, unknown> = {}): string {
  return `${toBase64Url({ alg: 'none', typ: 'JWT' })}.${toBase64Url(payload)}.sig`;
}

export async function writeAuthFixture(
  dir: string,
  { accessExpOffsetSeconds = 3600, accountId = 'acct-123' }: { accessExpOffsetSeconds?: number; accountId?: string } = {}
): Promise<{ authPath: string; installationIdPath: string; accessToken: string; accountId: string }> {
  const authPath = path.join(dir, 'auth.json');
  const installationIdPath = path.join(dir, 'installation_id');
  const accessToken = makeJwt({ exp: Math.floor(Date.now() / 1000) + accessExpOffsetSeconds });
  const auth = {
    auth_mode: 'chatgpt',
    last_refresh: new Date().toISOString(),
    tokens: { access_token: accessToken, account_id: accountId, id_token: null, refresh_token: 'rt' }
  };
  await fs.writeFile(authPath, JSON.stringify(auth, null, 2));
  await fs.writeFile(installationIdPath, 'install-123');
  return { authPath, installationIdPath, accessToken, accountId };
}

// Minimal fake http req/res pair for handler tests.
// The fake objects implement just enough of the Node HTTP interfaces
// for createHandler to work. Casts are confined to this test helper.
interface FakeReqArgs {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}

type EventListener = (...args: unknown[]) => void;

export function fakeRequest({ method = 'POST', url = '/generate', headers = {}, body = '' }: FakeReqArgs = {}): http.IncomingMessage {
  const listeners: Record<string, EventListener[]> = {};
  const req = {
    method,
    url,
    headers,
    on(event: string, fn: EventListener) { (listeners[event] ||= []).push(fn); return req; },
    destroy() { listeners.destroy?.forEach((fn) => fn()); },
    emit(event: string, ...args: unknown[]) { listeners[event]?.forEach((fn) => fn(...args)); }
  };
  // Emit body data on next tick to mimic a stream.
  if (body) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    process.nextTick(() => req.emit('end'));
  }
  return req as unknown as http.IncomingMessage;
}

export function fakeResponse(): http.ServerResponse {
  const res = {
    statusCode: null as number | null,
    headers: {} as Record<string, string | number>,
    body: '' as string,
    ended: false as boolean,
    writeHead(status: number, headers: Record<string, string | number>) { this.statusCode = status; this.headers = headers; },
    end(body?: string) { this.body = body ?? ''; this.ended = true; }
  };
  return res as unknown as http.ServerResponse;
}
