import assert from "node:assert/strict";
import { mkdtemp, mkdir, readlink, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { doctorProfile } from "../src/doctor.js";
import {
  initProfile,
  linkProfile,
  profileNameForAccount,
  renderAlias,
  renderAliases,
  renderSetup,
} from "../src/linker.js";
import { renderStatusLines, statusProfiles } from "../src/status.js";

async function withTempHome(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "codex-linker-"));
  try {
    await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("uses subs profile names for secondary accounts", () => {
  assert.equal(profileNameForAccount(2), "subs2");
  assert.equal(profileNameForAccount(3), "subs3");
  assert.throws(() => profileNameForAccount(1), /account must be 2 or greater/);
});

test("setup creates subs homes and prints login, link, doctor, and alias steps", async () => {
  await withTempHome(async (home) => {
    const lines = await renderSetup(3, { home });

    assert.deepEqual(lines, [
      "Created account homes:",
      `- ${home}/.codex-accounts/subs2`,
      `- ${home}/.codex-accounts/subs3`,
      "",
      "Login each extra account:",
      `CODEX_HOME="${home}/.codex-accounts/subs2" codex login`,
      `CODEX_HOME="${home}/.codex-accounts/subs3" codex login`,
      "",
      "After login, link shared Codex files and verify:",
      "codex-linker link subs2",
      "codex-linker link subs3",
      "codex-linker doctor subs2",
      "codex-linker doctor subs3",
      "",
      "Install aliases:",
      "codex-linker aliases --accounts 3 >> ~/.zshrc",
      "source ~/.zshrc",
    ]);
  });
});

test("linkProfile symlinks non-auth files and skips auth.json", async () => {
  await withTempHome(async (home) => {
    const sourceHome = join(home, ".codex");
    const targetHome = join(home, ".codex-accounts", "subs2");
    await mkdir(sourceHome, { recursive: true });
    await writeFile(join(sourceHome, "auth.json"), "primary-secret");
    await writeFile(join(sourceHome, "config.toml"), "model = 'gpt'");
    await mkdir(join(sourceHome, "skills"));
    await initProfile({ name: "subs2", home });

    const messages = await linkProfile({ name: "subs2", home });

    assert.deepEqual(messages, [
      `linked ${targetHome}/config.toml -> ${sourceHome}/config.toml`,
      `linked ${targetHome}/skills -> ${sourceHome}/skills`,
    ]);
    assert.equal(await readlink(join(targetHome, "config.toml")), join(sourceHome, "config.toml"));
    await assert.rejects(readlink(join(targetHome, "auth.json")), /ENOENT/);
  });
});

test("linkProfile refuses conflicts unless force is set", async () => {
  await withTempHome(async (home) => {
    const sourceHome = join(home, ".codex");
    const targetHome = join(home, ".codex-accounts", "subs2");
    await mkdir(sourceHome, { recursive: true });
    await writeFile(join(sourceHome, "config.toml"), "primary");
    await initProfile({ name: "subs2", home });
    await writeFile(join(targetHome, "config.toml"), "local");

    await assert.rejects(
      linkProfile({ name: "subs2", home }),
      /target already exists/
    );

    const messages = await linkProfile({ name: "subs2", home, force: true });
    assert.deepEqual(messages, [
      `replaced ${targetHome}/config.toml`,
      `linked ${targetHome}/config.toml -> ${sourceHome}/config.toml`,
    ]);
  });
});

test("doctorProfile rejects target auth symlink and passes valid linked homes", async () => {
  await withTempHome(async (home) => {
    const sourceHome = join(home, ".codex");
    const targetHome = join(home, ".codex-accounts", "subs2");
    await mkdir(sourceHome, { recursive: true });
    await writeFile(join(sourceHome, "auth.json"), "primary-secret");
    await writeFile(join(sourceHome, "config.toml"), "primary");
    await initProfile({ name: "subs2", home });
    await linkProfile({ name: "subs2", home });

    assert.deepEqual(await doctorProfile({ name: "subs2", home }), {
      ok: true,
      problems: [],
    });

    await symlink(join(sourceHome, "auth.json"), join(targetHome, "auth.json"));
    const result = await doctorProfile({ name: "subs2", home });
    assert.equal(result.ok, false);
    assert.deepEqual(result.problems, [
      `${targetHome}/auth.json must be a real file, not a symlink`,
    ]);
  });
});

test("renders single and multi-account aliases", () => {
  assert.equal(
    renderAlias("subs2", 2),
    `alias codex2='CODEX_HOME="$HOME/.codex-accounts/subs2" codex'`
  );
  assert.deepEqual(renderAliases(3), [
    `alias codex1='CODEX_HOME="$HOME/.codex" codex'`,
    `alias codex2='CODEX_HOME="$HOME/.codex-accounts/subs2" codex'`,
    `alias codex3='CODEX_HOME="$HOME/.codex-accounts/subs3" codex'`,
  ]);
});

test("statusProfiles reports local auth state without network by default", async () => {
  await withTempHome(async (home) => {
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".codex-accounts", "subs2"), { recursive: true });
    await writeFile(
      join(home, ".codex", "auth.json"),
      JSON.stringify({ tokens: { access_token: "primary-token" } })
    );

    const statuses = await statusProfiles({
      accounts: 2,
      home,
      api: false,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    });

    assert.deepEqual(renderStatusLines(statuses), [
      "codex1  auth: present  usage: api disabled  resets: api disabled",
      "codex2  auth: missing  usage: api disabled  resets: api disabled",
    ]);
  });
});

test("statusProfiles fetches usage and reset summaries when api is enabled", async () => {
  await withTempHome(async (home) => {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(
      join(home, ".codex", "auth.json"),
      JSON.stringify({ tokens: { access_token: "primary-token" }, account_id: "acct-secret" })
    );

    const requested: Array<{ url: string; authorization: string | null }> = [];
    const statuses = await statusProfiles({
      accounts: 1,
      home,
      api: true,
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers);
        requested.push({
          url: String(url),
          authorization: headers.get("authorization"),
        });
        if (String(url).endsWith("/usage")) {
          return new Response(JSON.stringify({ used: 4, limit: 20 }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ available: 2, expires_at: "2026-07-17T00:00:00Z" }),
          { status: 200 }
        );
      },
    });

    assert.deepEqual(requested, [
      {
        url: "https://chatgpt.com/backend-api/wham/usage",
        authorization: "Bearer primary-token",
      },
      {
        url: "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
        authorization: "Bearer primary-token",
      },
    ]);
    assert.deepEqual(renderStatusLines(statuses), [
      "codex1  auth: present  usage: 16/20 left (80%)  resets: 2 available, expires 2026-07-17",
    ]);
  });
});

test("status output does not include tokens or account ids", async () => {
  await withTempHome(async (home) => {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(
      join(home, ".codex", "auth.json"),
      JSON.stringify({ tokens: { access_token: "secret-token" }, account_id: "acct-secret" })
    );

    const statuses = await statusProfiles({
      accounts: 1,
      home,
      api: true,
      fetchImpl: async () => new Response(JSON.stringify({ used: 1, limit: 2 }), { status: 200 }),
    });
    const output = renderStatusLines(statuses).join("\n");

    assert.equal(output.includes("secret-token"), false);
    assert.equal(output.includes("acct-secret"), false);
  });
});
