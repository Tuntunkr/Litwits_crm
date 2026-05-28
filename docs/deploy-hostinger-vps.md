# Deploying Litwits (TanStack Start) on Hostinger VPS

TanStack Start outputs **`dist/client`** (static chunks) plus **`dist/server/server.js`** (SSR + `/api`). The HTML is rendered by Node, not uploaded as plain static files-only hosting.

## What Hostinger plan you need

- **Shared / “cheap” web hosting**: only PHP + static files. **Not sufficient** — you cannot run long-lived Node SSR there.
- **Hostinger VPS (or Cloud)**: Ubuntu + SSH + systemd/PM2. **This matches** production Node.

Easiest alternative: deploy on **Netlify** (already supported by this repo’s `@netlify/vite-plugin-tanstack-start`).

## On the VPS (Ubuntu-style)

### 1. Prerequisites

- Node.js **20 or 22** (LTS)
- Corepack-enabled `pnpm` (or npm if you mirror scripts)

### 2. Clone and env

```bash
git clone <your-repo-url> litwitscrm && cd litwitscrm
cp .env.example .env   # fill SUPABASE_*, AUTH_SECRET, etc.
```

Never commit `.env`. Keep **`SUPABASE_SERVICE_ROLE_KEY`** only on the server.

### 3. Build

```bash
pnpm install --frozen-lockfile
pnpm run build
```

### 4. Run in production (`srvx` + bundled handler)

After build, **`pnpm start`** runs:

`srvx` → `scripts/production-server.mjs` → imports `dist/server/server.js` `{ fetch }`.

```bash
export NODE_ENV=production
export PORT=3000
pnpm start
```

Or explicitly:

```bash
NODE_ENV=production PORT=3000 pnpm exec srvx scripts/production-server.mjs
```

### 5. Process manager (PM2)

```bash
npm i -g pm2
pm2 start "pnpm start" --name litwits-crm --cwd /var/www/litwitscrm --update-env --env NODE_ENV=production
pm2 save && pm2 startup
```

(Optional) set `PORT` in `.env` or systemd `Environment=` so PM2 inherits it.

### 6. Nginx reverse proxy + HTTPS

Example site block (`/etc/nginx/sites-available/litwits`):

```nginx
server {
  listen 80;
  server_name yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable TLS with **Certbot** (`certbot --nginx -d yourdomain.com`).

## What **not** to do

- Do **not** upload only **`dist/client`** to static file hosting expecting the app + APIs to work.
- Do **not** expose Supabase **service role** key in the browser or in build artifacts pushed to CDN.
