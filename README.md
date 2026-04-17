# link.kyletns.com

A tiny personal URL shortener running on a Cloudflare Worker + KV.

## Why

I wanted short links under my own domain without paying for Bitly or running a server. A single Worker file + a KV namespace does the whole job for free, and I can manage links from any device — terminal, phone, browser.

## How it works

- **Worker** (`src/worker.js`) handles three things:
  - `GET /<code>` — looks up `code` in KV and 302s to the stored URL. Unknown codes redirect to my homepage.
  - `GET /admin` — serves a single-page dark-themed HTML admin UI (login, add, filter, delete).
  - `POST /api/create | /api/delete`, `GET /api/list` — JSON API protected by a bearer token (`ADMIN_PASSWORD`, stored as a Wrangler secret).
- **KV namespace** `LINKS` stores `code → url`, with a `created` timestamp in metadata.
- If `POST /api/create` is called without a `code`, the worker generates a 4-char slug from a collision-safe alphabet (and returns any existing code if the URL is already stored).
- Cloudflare handles DNS, TLS, and routing via a custom domain bound to the Worker.

## Using it

- **Browser:** visit `/admin`, unlock, paste a URL, hit shorten. Gets copied to clipboard.
- **Terminal:** `shorten <url>` or `shorten <code> <url>` (zsh function that curls `/api/create`).
- **TextExpander:** a shell-script snippet reads the clipboard, POSTs to the API, outputs the short URL.
- **iOS Shortcut:** Share URL → POSTs to the API → copies short URL clipboard.

## Deploy

```
npm install
npx wrangler login
npx wrangler kv namespace create LINKS   # paste id into wrangler.toml
echo "your-password" | npx wrangler secret put ADMIN_PASSWORD
npx wrangler deploy
```

Then in the Cloudflare dashboard, bind a custom domain to the Worker.

Local dev: `npx wrangler dev` (set `ADMIN_PASSWORD` in `.dev.vars`).
