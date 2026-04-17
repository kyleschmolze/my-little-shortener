# My Little Shortener

A tiny personal URL shortener that runs for free on a Cloudflare Worker + KV.

![Admin UI preview](my-little-shortner-preview.png)

## Why

I wanted short links under my own domain without paying for Bitly or running a server. A single Worker file + a KV namespace does the whole job for free, and I can manage links from any device — terminal, phone, browser.

## Using it

- **Browser:** visit `/`, unlock, paste a URL, hit shorten. Gets copied to clipboard.
- **Terminal:** `shorten <url>` or `shorten <code> <url>` (zsh function that curls `/api/create`).
- **TextExpander:** a shell-script snippet reads the clipboard, POSTs to the API, outputs the short URL.
- **iOS Shortcut:** Share URL → POSTs to the API → copies short URL clipboard.

## How it works

- **Worker** (`src/worker.js`) handles three things:
  - `GET /<code>` — looks up `code` in KV and 302s to the stored URL. Unknown codes redirect to my homepage.
  - `GET /` (or any unknown code) — serves a single-page dark-themed HTML admin UI (login, add, filter, delete).
  - `POST /api/create | /api/delete`, `GET /api/list` — JSON API protected by a bearer token (`ADMIN_PASSWORD`, stored as a Wrangler secret).
- **KV namespace** `LINKS` stores `code → url`, with a `created` timestamp in metadata.
- If `POST /api/create` is called without a `code`, the worker generates a 4-char slug from a collision-safe alphabet (and returns any existing code if the URL is already stored).
- Cloudflare handles DNS, TLS, and routing via a custom domain bound to the Worker.

## A note on KV consistency

Cloudflare KV's `list` operation is eventually consistent — cached at the edge for up to ~60s after writes. So right after creating or deleting a link, a fresh `list` from the same POP can return a stale view (sometimes showing the whole list as empty for a bit). The admin UI works around this by updating its in-memory list optimistically after create/delete instead of refetching, so you won't see the lag during normal use. A hard refresh within the cache window can still briefly show stale state.

## Deploy

```
npm install
npx wrangler login
npx wrangler kv namespace create LINKS   # paste id into wrangler.toml
echo "your-password" | npx wrangler secret put ADMIN_PASSWORD
npx wrangler deploy
```

Then in the Cloudflare dashboard, bind a custom domain to the Worker.

## Customizing

In `wrangler.toml`:

- **`name`** — the Worker name (also the default `*.workers.dev` subdomain). Change before first deploy.
- **`kv_namespaces[0].id`** — the KV namespace id. Replace with the id printed by `wrangler kv namespace create LINKS`.
- **`vars.TITLE`** — the heading shown on `/`. Defaults to `My Little Shortner` if unset. Dots in the title get accent-color styling (e.g. `link.example.com`).


Local dev: `npx wrangler dev` (set `ADMIN_PASSWORD` in `.dev.vars`).

## TextExpander snippet

Create a new snippet with content type **Shell Script**, then paste this in (replace `YOUR.DOMAIN` and `YOURPASSWORD`). Copy a URL, fire the snippet, and it replaces itself with the short URL (also copied to clipboard):

```bash
#! /bin/bash
URL="$(/usr/bin/pbpaste)"
RESP=$(/usr/bin/curl -s -X POST "https://YOUR.DOMAIN/api/create" \
  -H "Authorization: Bearer YOURPASSWORD" \
  -H "content-type: application/json" \
  -d "{\"url\":\"$URL\"}")
CODE=$(echo "$RESP" | /usr/bin/sed -n 's/.*"code":"\([^"]*\)".*/\1/p')
if [ -n "$CODE" ]; then
  SHORT="https://YOUR.DOMAIN/$CODE"
  printf "%s" "$SHORT" | /usr/bin/pbcopy
  printf "%s" "$SHORT"
else
  printf "ERR: %s" "$RESP"
fi
```

## iOS Shortcut (Share Sheet)

Create a new Shortcut that accepts URLs from the share sheet and posts them to the API:

1. New Shortcut → tap the **ⓘ** info button → enable **Show in Share Sheet**, set **Share Sheet Types** to **URLs only**.
2. Add action **Get Contents of URL**:
   - URL: `https://YOUR.DOMAIN/api/create`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer YOURPASSWORD`, `Content-Type` = `application/json`
   - Request Body: **JSON** with one field `url` (Text) = the **Shortcut Input** variable.
3. Add action **Get Dictionary Value** → Get **Value for `code`** in **Contents of URL**.
4. Add action **Text** with `https://YOUR.DOMAIN/` followed by the **Dictionary Value** variable.
5. Add action **Copy to Clipboard** (input: the Text from step 4). Optionally add **Show Notification** to confirm.

Rename the Shortcut (e.g. "Shorten Link"). Then from any app: Share → Shorten Link → the short URL is on your clipboard.

## License
Do whatever you want I obviously wrote this with Claude 🤖
