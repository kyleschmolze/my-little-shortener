const RESERVED = new Set(["admin", "api", "favicon.ico", "robots.txt", ""]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.slice(1);

    if (path === "admin" || path === "") return adminPage();
    if (path.startsWith("api/")) return handleApi(request, env, path.slice(4));
    if (path === "favicon.ico") return new Response(null, { status: 404 });

    const target = await env.LINKS.get(path);
    if (!target) return adminPage();
    return Response.redirect(target, 302);
  },
};

async function handleApi(request, env, action) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== env.ADMIN_PASSWORD) {
    return json({ error: "unauthorized" }, 401);
  }

  if (action === "list" && request.method === "GET") {
    const { keys } = await env.LINKS.list();
    const entries = await Promise.all(
      keys.map(async (k) => ({
        code: k.name,
        url: await env.LINKS.get(k.name),
        created: k.metadata?.created || null,
      }))
    );
    return json({ entries });
  }

  if (action === "create" && request.method === "POST") {
    const body = await request.json();
    const target = body.url;
    if (!target) return json({ error: "url required" }, 400);
    try {
      new URL(target);
    } catch {
      return json({ error: "invalid url" }, 400);
    }
    let code = body.code;
    if (code) {
      if (RESERVED.has(code) || !/^[a-zA-Z0-9_-]+$/.test(code)) {
        return json({ error: "invalid code" }, 400);
      }
    } else {
      const existing = await findByUrl(env, target);
      if (existing) return json({ ok: true, code: existing, url: target, reused: true });
      code = await generateCode(env);
      if (!code) return json({ error: "could not generate code" }, 500);
    }
    await env.LINKS.put(code, target, { metadata: { created: Date.now() } });
    return json({ ok: true, code, url: target });
  }

  if (action === "delete" && request.method === "POST") {
    const { code } = await request.json();
    if (!code) return json({ error: "code required" }, 400);
    await env.LINKS.delete(code);
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
}

async function findByUrl(env, target) {
  let cursor;
  do {
    const res = await env.LINKS.list({ cursor });
    const values = await Promise.all(res.keys.map((k) => env.LINKS.get(k.name)));
    for (let i = 0; i < res.keys.length; i++) {
      if (values[i] === target) return res.keys[i].name;
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return null;
}

async function generateCode(env) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    for (const b of bytes) code += alphabet[b % alphabet.length];
    if (!(await env.LINKS.get(code))) return code;
  }
  return null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function adminPage() {
  return new Response(ADMIN_HTML, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const ADMIN_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>shortener</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #171a21;
    --panel-2: #1e222b;
    --text: #e6e8ee;
    --muted: #8a93a6;
    --border: #2a2f3a;
    --accent: #7c5cff;
    --accent-hover: #6847ff;
    --ok: #4ade80;
    --err: #f87171;
  }
  * { box-sizing: border-box; }
  html, body { background: var(--bg); color: var(--text); }
  body {
    font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
    max-width: 640px;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
    line-height: 1.45;
  }
  h1 {
    font-size: 1.35rem;
    font-weight: 600;
    margin: 0 0 1.5rem;
    letter-spacing: -0.01em;
  }
  h1 .dot { color: var(--accent); }
  input, button {
    font: inherit;
    width: 100%;
    padding: .7rem .85rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    display: block;
  }
  input { margin-bottom: .6rem; }
  input::placeholder { color: var(--muted); }
  input:focus { outline: none; border-color: var(--accent); }
  button {
    background: var(--accent);
    color: #fff;
    border: 0;
    cursor: pointer;
    font-weight: 500;
    transition: background .12s ease;
  }
  button:hover { background: var(--accent-hover); }
  .msg {
    margin: 1rem 0 0;
    font-size: .9rem;
    word-break: break-all;
  }
  .msg.ok { color: var(--ok); }
  .msg.err { color: var(--err); }
  .divider {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 1rem 0 1rem;
  }
  .entry {
    padding: .9rem 0;
    border-bottom: 1px solid var(--border);
  }
  .entry:last-child { border-bottom: 0; }
  .entry .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 1rem;
    color: var(--accent);
    text-decoration: none;
  }
  .entry .code:hover { text-decoration: underline; }
  .entry .url {
    color: var(--muted);
    font-size: .88rem;
    margin-top: .15rem;
    word-break: break-all;
  }
  .entry .meta {
    font-size: .78rem;
    color: var(--muted);
    margin-top: .35rem;
  }
  .entry .meta a {
    color: var(--err);
    text-decoration: none;
    cursor: pointer;
  }
  .entry .meta a:hover { text-decoration: underline; }
  .entry .meta .sep { margin: 0 .45rem; color: var(--border); }
  .empty { color: var(--muted); font-size: .9rem; padding: 1rem 0; }
</style>
</head>
<body>
<h1>link<span class="dot">.</span>kyletns<span class="dot">.</span>com</h1>
<div id="login">
  <input id="pw" type="password" placeholder="password" autocomplete="current-password">
  <button onclick="login(true)">unlock</button>
</div>
<div id="app" style="display:none">
  <input id="code" placeholder="code (optional)" autocapitalize="off" autocorrect="off">
  <input id="url" placeholder="https://..." autocapitalize="off" autocorrect="off">
  <button onclick="create()">shorten</button>
  <div class="msg" id="msg"></div>
  <hr class="divider">
  <input id="search" placeholder="filter..." autocapitalize="off" autocorrect="off" autocomplete="off">
  <div id="list"></div>
</div>
<script>
  const $ = (id) => document.getElementById(id);
  let pw = localStorage.getItem("pw") || "";

  async function api(action, method, body) {
    const res = await fetch("/api/" + action, {
      method,
      headers: { "authorization": "Bearer " + pw, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  }

  async function login(fromInput) {
    if (fromInput) pw = $("pw").value;
    const r = await api("list", "GET");
    if (r.ok) {
      localStorage.setItem("pw", pw);
      $("login").style.display = "none";
      $("app").style.display = "";
      render(r.data.entries);
    } else {
      $("pw").value = "";
      if (fromInput) alert("wrong password");
    }
  }

  async function create() {
    const code = $("code").value.trim();
    const url = $("url").value.trim();
    if (!url) return;
    const r = await api("create", "POST", code ? { code, url } : { url });
    const msg = $("msg");
    if (r.ok) {
      $("code").value = "";
      $("url").value = "";
      const short = location.origin + "/" + r.data.code;
      msg.textContent = "copied: " + short;
      msg.className = "msg ok";
      try { await navigator.clipboard.writeText(short); } catch {}
      refresh();
    } else {
      msg.textContent = r.data.error || "error";
      msg.className = "msg err";
    }
  }

  async function del(code) {
    if (!confirm("delete /" + code + "?")) return;
    await api("delete", "POST", { code });
    refresh();
  }

  async function refresh() {
    const r = await api("list", "GET");
    if (r.ok) render(r.data.entries);
  }

  function formatDate(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  let allEntries = [];
  function render(entries) {
    allEntries = entries.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
    applyFilter();
  }

  function applyFilter() {
    const q = $("search").value.trim().toLowerCase();
    const entries = q
      ? allEntries.filter((e) => e.code.toLowerCase().includes(q) || e.url.toLowerCase().includes(q))
      : allEntries;
    const list = $("list");
    if (!allEntries.length) {
      list.innerHTML = '<div class="empty">no links yet</div>';
      return;
    }
    if (!entries.length) {
      list.innerHTML = '<div class="empty">no matches</div>';
      return;
    }
    list.innerHTML = entries.map((e) => {
      const codeEsc = escapeHtml(e.code);
      const codeAttr = e.code.replace(/'/g, "\\\\'");
      const date = formatDate(e.created);
      return '<div class="entry">' +
        '<a class="code" href="/' + codeEsc + '" target="_blank">/' + codeEsc + '</a>' +
        '<div class="url">' + escapeHtml(e.url) + '</div>' +
        '<div class="meta">' +
          '<a onclick="del(\\'' + codeAttr + '\\')">delete</a>' +
          (date ? '<span class="sep">•</span>' + date : '') +
        '</div>' +
      '</div>';
    }).join("");
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  $("search").addEventListener("input", applyFilter);

  if (pw) login();
  $("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") login(true); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && $("app").style.display !== "none" && (e.target.id === "code" || e.target.id === "url")) {
      create();
    }
  });
</script>
</body>
</html>`;
