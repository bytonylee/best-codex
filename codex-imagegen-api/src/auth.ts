// Auth: load and validate Codex ChatGPT session from ~/.codex/auth.json
import fs from 'node:fs/promises';

import type { Config } from './config.js';
import { CodedError } from './errors.js';

interface AuthJson {
  auth_mode?: string;
  tokens?: {
    access_token?: string;
    account_id?: string;
    id_token?: string | null;
    refresh_token?: string;
  };
}

interface JwtPayload {
  exp?: number;
  [k: string]: unknown;
}

export interface Session {
  authMode: string | null;
  accessToken: string | null;
  accountId: string | null;
  installationId: string | null;
}

export interface SessionValidation {
  warnings: string[];
}

export interface AuthStatus {
  ok: boolean;
  authMode?: string | null;
  hasAccessToken?: boolean;
  hasAccountId?: boolean;
  hasInstallationId?: boolean;
  warnings: string[];
  error?: string;
  code?: string;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function decodeJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const p = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (p.length % 4 || 4)) % 4;
    return JSON.parse(Buffer.from(p + '='.repeat(pad), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function loadSession(config: Pick<Config, 'authFile' | 'installationIdFile'>): Promise<Session> {
  const raw = await fs.readFile(config.authFile, 'utf8');
  const json = JSON.parse(raw) as AuthJson;
  const tokens = json?.tokens ?? {};

  let installationId: string | null = null;
  try {
    installationId = str(await fs.readFile(config.installationIdFile, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e;
  }

  return {
    authMode: str(json?.auth_mode),
    accessToken: str(tokens?.access_token),
    accountId: str(tokens?.account_id),
    installationId
  };
}

export function validateSession(session: Session): SessionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!session?.accessToken) errors.push('Missing tokens.access_token in ~/.codex/auth.json');
  if (!session?.accountId) errors.push('Missing tokens.account_id in ~/.codex/auth.json');

  if (session?.authMode && session.authMode !== 'chatgpt') {
    warnings.push(`auth_mode is ${session.authMode}; expected "chatgpt". Run: codex login`);
  }
  if (!session?.installationId) {
    warnings.push('Missing ~/.codex/installation_id; requests will omit it.');
  }

  const payload = decodeJwtPayload(session?.accessToken);
  if (payload?.exp) {
    const exp = new Date(payload.exp * 1000);
    if (Number.isFinite(exp.getTime()) && exp.getTime() <= Date.now()) {
      warnings.push(`access token expired at ${exp.toISOString()}. Run: codex login`);
    }
  }

  if (errors.length > 0) {
    throw new CodedError(
      `Invalid Codex session: ${errors.join(' ')}`,
      'INVALID_SESSION',
      { warnings }
    );
  }
  return { warnings };
}

// Natural authentication check: returns clear status for the user.
export async function checkAuth(config: Config): Promise<AuthStatus> {
  try {
    const session = await loadSession(config);
    const { warnings } = validateSession(session);
    return {
      ok: true,
      authMode: session.authMode,
      hasAccessToken: Boolean(session.accessToken),
      hasAccountId: Boolean(session.accountId),
      hasInstallationId: Boolean(session.installationId),
      warnings
    };
  } catch (e) {
    if (e instanceof CodedError) {
      return { ok: false, error: e.message, code: e.code, warnings: e.warnings ?? [] };
    }
    return { ok: false, error: (e as Error).message, warnings: [] };
  }
}
