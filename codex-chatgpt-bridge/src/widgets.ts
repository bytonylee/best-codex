export const WIDGET_URI = "ui://widget/cc-bridge-card.html";

/** Compact ChatGPT Apps card HTML for the bridge status. */
export function renderCardWidget(opts: {
  root: string;
  serverUrl: string;
  tools: string[];
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CC Bridge</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --card:#171a21; --fg:#e6e8ee; --muted:#9aa3b2; --accent:#6ea8fe; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:var(--bg); color:var(--fg); }
  .card { max-width: 520px; margin: 24px auto; padding: 20px; background:var(--card); border:1px solid #232733; border-radius:14px; }
  h1 { font-size: 16px; margin:0 0 4px; letter-spacing:.2px; }
  .muted { color:var(--muted); font-size:12px; }
  .row { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-top:1px solid #232733; font-size:13px; }
  .row:first-of-type { border-top:none; }
  code { background:#0b0d12; padding:2px 6px; border-radius:6px; font-size:12px; }
  .tools { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .tag { background:#0b0d12; border:1px solid #232733; color:var(--muted); padding:3px 8px; border-radius:999px; font-size:11px; }
  .url { word-break:break-all; }
</style>
</head>
<body>
  <div class="card">
    <h1>CC Bridge</h1>
    <div class="muted">Local MCP bridge for ChatGPT Developer Mode</div>
    <div class="row"><span>Workspace</span><code>${escapeHtml(opts.root)}</code></div>
    <div class="row"><span>Server URL</span><code class="url">${escapeHtml(redactTokenInUrl(opts.serverUrl))}</code></div>
    <div class="row" style="display:block">
      <span>Tools</span>
      <div class="tools">
        ${opts.tools.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Fallback UI for selecting or uploading a generated image artifact. */
export function renderSaveImageWidget(opts: {
  serverUrl: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Save Image Artifact</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --card:#171a21; --fg:#e6e8ee; --muted:#9aa3b2; --accent:#6ea8fe; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:var(--bg); color:var(--fg); }
  .card { max-width: 520px; margin: 24px auto; padding: 20px; background:var(--card); border:1px solid #232733; border-radius:14px; }
  h1 { font-size: 16px; margin:0 0 12px; }
  label { display:block; font-size:12px; color:var(--muted); margin:12px 0 4px; }
  input, select, button { width:100%; padding:10px; border-radius:8px; border:1px solid #232733; background:#0b0d12; color:var(--fg); font-size:13px; }
  button { background:var(--accent); color:#0b0d12; border:none; font-weight:600; margin-top:16px; cursor:pointer; }
  .hint { color:var(--muted); font-size:11px; margin-top:8px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Save Image Artifact</h1>
    <p class="hint">Select a generated image or paste base64 image data to save into the workspace.</p>
    <label for="file">Image file</label>
    <input id="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
    <label for="slug">Slug (optional)</label>
    <input id="slug" type="text" placeholder="my-image" />
    <label for="overwrite">Overwrite</label>
    <select id="overwrite"><option value="false">No</option><option value="true">Yes</option></select>
    <button id="save">Save to workspace</button>
    <div id="result" class="hint"></div>
  </div>
  <script>
    const el = (id) => document.getElementById(id);
    el('save').addEventListener('click', async () => {
      const file = el('file').files[0];
      if (!file) { el('result').textContent = 'Choose a file first.'; return; }
      const b64 = await toBase64(file);
      const res = await fetch(${JSON.stringify(opts.serverUrl)} + '/save-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: b64, mimeType: file.type, slug: el('slug').value, overwrite: el('overwrite').value === 'true' })
      });
      const json = await res.json();
      el('result').textContent = JSON.stringify(json, null, 2);
    });
    function toBase64(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function redactTokenInUrl(url: string): string {
  return url.replace(/([?&]cc_bridge_token=)[^&]+/, "$1[REDACTED]");
}
