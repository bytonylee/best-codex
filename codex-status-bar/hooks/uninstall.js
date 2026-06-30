#!/usr/bin/env node
// Removes the status-bar hooks from ~/.codex/hooks.json. Leaves all other
// hooks intact.

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const home = os.homedir();
const MARKER = path.join(".codex", "statusbar");
const settingsPath = path.join(home, ".codex", "hooks.json");

function writeJsonAtomic(file, value) {
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

try { cp.execSync("pkill -x CodexStatusBar", { stdio: "ignore" }); } catch {}

if (!fs.existsSync(settingsPath)) {
  console.log("No hooks.json; nothing to do.");
  process.exit(0);
}

let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (err) {
  console.error(`Could not parse existing hook settings at ${settingsPath}: ${err.message}`);
  process.exit(1);
}
for (const evt of Object.keys(settings.hooks || {})) {
  settings.hooks[evt] = (settings.hooks[evt] || [])
    .map((e) => ({
      ...e,
      hooks: (e.hooks || []).filter((h) => !(h.command || "").includes(MARKER)),
    }))
    .filter((e) => (e.hooks || []).length > 0);
  if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
}
writeJsonAtomic(settingsPath, settings);
console.log("Removed status-bar hooks from", settingsPath);
