#!/usr/bin/env node
// Installs the status-bar hooks into ~/.codex/hooks.json (merging, never
// clobbering existing hooks) and copies update.js / lifecycle.js to
// ~/.codex/statusbar/. Re-runnable: existing status-bar hooks are stripped
// before re-adding.

const fs = require("fs");
const os = require("os");
const path = require("path");

const home = os.homedir();
const sbDir = path.join(home, ".codex", "statusbar");
const MARKER = path.join(".codex", "statusbar"); // every hook command we add points inside this dir
const updateDest = path.join(sbDir, "update.js");
const lifecycleDest = path.join(sbDir, "lifecycle.js");
const settingsPath = path.join(home, ".codex", "hooks.json");
const node = process.execPath;

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function writeJsonAtomic(file, value) {
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

fs.mkdirSync(sbDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, "update.js"), updateDest);
fs.copyFileSync(path.join(__dirname, "lifecycle.js"), lifecycleDest);

const cmd = (evt) => `${shellQuote(node)} ${shellQuote(updateDest)} ${shellQuote(evt)}`;
const life = (evt) => `${shellQuote(node)} ${shellQuote(lifecycleDest)} ${shellQuote(evt)}`;

let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (err) {
    console.error(`Could not parse existing hook settings at ${settingsPath}: ${err.message}`);
    process.exit(1);
  }
  const bak = settingsPath + ".bak-statusbar";
  if (!fs.existsSync(bak)) fs.copyFileSync(settingsPath, bak);
}
settings.hooks = settings.hooks || {};

const stripOurs = (arr) =>
  (arr || [])
    .map((entry) => ({
      ...entry,
      hooks: (entry.hooks || []).filter((h) => !(h.command || "").includes(MARKER)),
    }))
    .filter((entry) => (entry.hooks || []).length > 0);

const addUnmatched = (evt, command) => {
  settings.hooks[evt] = stripOurs(settings.hooks[evt]);
  settings.hooks[evt].push({ hooks: [{ type: "command", command }] });
};
const addMatched = (evt, command) => {
  settings.hooks[evt] = stripOurs(settings.hooks[evt]);
  settings.hooks[evt].push({ matcher: "*", hooks: [{ type: "command", command }] });
};

// Status hooks (drive the animation/label)
addUnmatched("UserPromptSubmit", cmd("prompt"));
addMatched("PreToolUse", cmd("pre"));
addMatched("PostToolUse", cmd("post"));
addUnmatched("Notification", cmd("notify"));
addMatched("PermissionRequest", cmd("permreq"));
addUnmatched("Stop", cmd("stop"));
// Lifecycle hooks (launch the app on open; the app quits itself when idle)
addUnmatched("SessionStart", life("start"));
addUnmatched("SessionEnd", life("end"));

writeJsonAtomic(settingsPath, settings);
console.log("Installed status-bar hooks into", settingsPath);
console.log("Scripts:", updateDest, "and", lifecycleDest);
console.log("Backup (first run only):", settingsPath + ".bak-statusbar");
