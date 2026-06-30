#!/usr/bin/env node
import { doctorProfile } from "./doctor.js";
import {
  initProfile,
  linkProfile,
  renderAlias,
  renderAliases,
  renderSetup,
} from "./linker.js";
import { renderStatusLines, statusProfiles } from "./status.js";

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  accounts?: number;
  force: boolean;
  api: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let accounts: number | undefined;
  let force = false;
  let api = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--accounts") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--accounts requires a number");
      }
      accounts = Number(value);
      index += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--api") {
      api = true;
    } else {
      positional.push(arg);
    }
  }

  return {
    command: positional[0],
    positional: positional.slice(1),
    accounts,
    force,
    api,
  };
}

function requireName(args: ParsedArgs): string {
  const name = args.positional[0];
  if (!name) {
    throw new Error(`${args.command ?? "command"} requires a profile name`);
  }
  return name;
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);

  switch (args.command) {
    case "setup":
      console.log((await renderSetup(args.accounts ?? 3)).join("\n"));
      return 0;
    case "init":
      console.log((await initProfile({ name: requireName(args) })).join("\n"));
      return 0;
    case "link":
      console.log((await linkProfile({ name: requireName(args), force: args.force })).join("\n"));
      return 0;
    case "doctor": {
      const result = await doctorProfile({ name: requireName(args) });
      if (result.ok) {
        console.log("ok");
        return 0;
      }
      console.error(result.problems.join("\n"));
      return 1;
    }
    case "alias":
      console.log(renderAlias(requireName(args)));
      return 0;
    case "aliases":
      console.log(renderAliases(args.accounts ?? 3).join("\n"));
      return 0;
    case "status":
      console.log(renderStatusLines(await statusProfiles({
        accounts: args.accounts ?? 3,
        api: args.api,
      })).join("\n"));
      if (!args.api) {
        console.log("");
        console.log("Pass --api to call private ChatGPT usage/reset endpoints.");
      }
      return 0;
    default:
      console.error("usage: codex-linker <setup|init|link|doctor|alias|aliases|status> [name] [--accounts N] [--force] [--api]");
      return 1;
  }
}

run().then((code) => {
  process.exitCode = code;
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
