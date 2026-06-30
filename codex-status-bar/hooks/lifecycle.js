#!/usr/bin/env node
// SessionStart/SessionEnd: launch the app, and track sessions as one file per
// session id in sessions.d/ (race-free; the app quits itself).
// Usage: node lifecycle.js <start|end>   (hook JSON, incl. session_id, on stdin)

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const BUNDLE_ID = "com.local.codexstatusbar";
const EXEC = "CodexStatusBar";
const dir = path.join(os.homedir(), ".codex", "statusbar");
const sessDir = path.join(dir, "sessions.d");
const statePath = path.join(dir, "state.json");
const sessionStateDir = path.join(dir, "session-state");
const event = process.argv[2];

function writeJsonAtomic(file, value) {
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

fs.mkdirSync(sessDir, { recursive: true });

const running = () => {
  try { cp.execSync(`pgrep -x ${EXEC}`, { stdio: "ignore" }); return true; }
  catch { return false; }
};
const safeId = (s) => String(s || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64) || "unknown";

// Reset a frozen animation when its OWNING session ends/resumes (force-quit
// fires SessionEnd but no Stop). The session-id gate is load-bearing: warmup
// churn bursts must not clear a live turn.
function clearStaleState(id) {
  const ts = Math.floor(Date.now() / 1000);
  try {
    const sessionPath = path.join(sessionStateDir, id + ".json");
    const sessionPrev = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    if (["thinking", "tool", "permission"].includes(sessionPrev.state)) {
      const sessionOut = { ...sessionPrev, state: "idle", label: "", startedAt: 0, ts };
      fs.mkdirSync(sessionStateDir, { recursive: true });
      writeJsonAtomic(sessionPath, sessionOut);
    }
  } catch {}

  try {
    const prev = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (safeId(prev.sessionId) !== id) return;
    if (!["thinking", "tool", "permission"].includes(prev.state)) return;
    const out = { ...prev, state: "idle", label: "", startedAt: 0, ts };
    writeJsonAtomic(statePath, out);
  } catch {}
}

let input = "", done = false;
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => run());
process.stdin.on("error", () => run());
setTimeout(run, 1000); // hooks always pipe stdin, but never hang the session

function run() {
  if (done) return; done = true;
  let id = "";
  try { id = JSON.parse(input).session_id; } catch {}
  id = safeId(id);

  if (event === "start") {
    // If the app isn't running, any leftover session files are stale (e.g. a
    // prior crash) — clear them so the count starts honest.
    if (!running()) {
      try { for (const f of fs.readdirSync(sessDir)) fs.rmSync(path.join(sessDir, f), { force: true }); } catch {}
    }
    try { fs.writeFileSync(path.join(sessDir, id), ""); } catch {}
    clearStaleState(id);
    cp.spawn("open", ["-g", "-j", "-b", BUNDLE_ID], { stdio: "ignore", detached: true }).unref();
  } else if (event === "end") {
    try { fs.rmSync(path.join(sessDir, id), { force: true }); } catch {}
    clearStaleState(id);
  }
  process.exit(0);
}
