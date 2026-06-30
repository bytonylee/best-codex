import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { AUTH_FILE, type HomeOptions, resolveHomes } from "./paths.js";
import { profileNameForAccount } from "./linker.js";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

type FetchLike = typeof fetch;

export interface StatusOptions extends HomeOptions {
  accounts: number;
  api: boolean;
  fetchImpl?: FetchLike;
}

export interface ProfileStatus {
  label: string;
  auth: "present" | "missing" | "invalid";
  usage: string;
  resets: string;
}

interface AccountHome {
  label: string;
  authPath: string;
}

function accountHomes(accounts: number, options: HomeOptions): AccountHome[] {
  if (!Number.isInteger(accounts) || accounts < 1) {
    throw new Error("accounts must be 1 or greater");
  }

  const { sourceHome, accountRoot } = resolveHomes(options);
  const homes: AccountHome[] = [{ label: "codex1", authPath: join(sourceHome, AUTH_FILE) }];
  for (let account = 2; account <= accounts; account += 1) {
    homes.push({
      label: `codex${account}`,
      authPath: join(accountRoot, profileNameForAccount(account), AUTH_FILE),
    });
  }
  return homes;
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.length > 0 ? current : undefined;
}

function extractAccessToken(auth: unknown): string | undefined {
  return (
    readNestedString(auth, ["tokens", "access_token"]) ??
    readNestedString(auth, ["access_token"]) ??
    readNestedString(auth, ["accessToken"])
  );
}

async function readAccessToken(authPath: string): Promise<{ auth: ProfileStatus["auth"]; token?: string }> {
  try {
    const auth = JSON.parse(await readFile(authPath, "utf8")) as unknown;
    const token = extractAccessToken(auth);
    return token ? { auth: "present", token } : { auth: "invalid" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { auth: "missing" };
    }
    return { auth: "invalid" };
  }
}

async function fetchJson(fetchImpl: FetchLike, url: string, token: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function collectObjects(value: unknown, out: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjects(item, out);
    }
  } else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    out.push(object);
    for (const item of Object.values(object)) {
      collectObjects(item, out);
    }
  }
  return out;
}

export function summarizeUsage(payload: unknown): string {
  for (const object of collectObjects(payload)) {
    const used = asNumber(object.used) ?? asNumber(object.used_count);
    const limit = asNumber(object.limit) ?? asNumber(object.total);
    const remaining = asNumber(object.remaining) ?? asNumber(object.remaining_count);

    if (typeof remaining === "number" && typeof limit === "number" && limit > 0) {
      const percent = Math.round((remaining / limit) * 100);
      return `${remaining}/${limit} left (${percent}%)`;
    }
    if (typeof used === "number" && typeof limit === "number" && limit > 0) {
      const left = Math.max(0, limit - used);
      const percent = Math.round((left / limit) * 100);
      return `${left}/${limit} left (${percent}%)`;
    }
  }
  return "unknown";
}

function findDate(value: unknown): string | undefined {
  for (const object of collectObjects(value)) {
    for (const key of ["expires_at", "expiresAt", "expiry", "expiration", "reset_at", "resetAt"]) {
      const date = object[key];
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
        return date.slice(0, 10);
      }
    }
  }
  return undefined;
}

export function summarizeResetCredits(payload: unknown): string {
  for (const object of collectObjects(payload)) {
    const available = asNumber(object.available) ?? asNumber(object.remaining) ?? asNumber(object.count);
    if (typeof available === "number") {
      const expires = findDate(payload);
      return expires ? `${available} available, expires ${expires}` : `${available} available`;
    }
  }
  return "unknown";
}

export async function statusProfiles(options: StatusOptions): Promise<ProfileStatus[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const statuses: ProfileStatus[] = [];

  for (const account of accountHomes(options.accounts, options)) {
    const auth = await readAccessToken(account.authPath);
    const status: ProfileStatus = {
      label: account.label,
      auth: auth.auth,
      usage: options.api ? "auth missing" : "api disabled",
      resets: options.api ? "auth missing" : "api disabled",
    };

    if (options.api && auth.token) {
      try {
        status.usage = summarizeUsage(await fetchJson(fetchImpl, USAGE_URL, auth.token));
      } catch {
        status.usage = "request failed";
      }
      try {
        status.resets = summarizeResetCredits(await fetchJson(fetchImpl, RESET_CREDITS_URL, auth.token));
      } catch {
        status.resets = "request failed";
      }
    }

    statuses.push(status);
  }

  return statuses;
}

export function renderStatusLines(statuses: ProfileStatus[]): string[] {
  return statuses.map((status) =>
    `${status.label}  auth: ${status.auth}  usage: ${status.usage}  resets: ${status.resets}`
  );
}
