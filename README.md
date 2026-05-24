# Litwits CRM

TanStack Start app (React 19 + Vite): portfolio/CRM UI with SSR and API routes.

## Development

```bash
pnpm install
pnpm dev
```

## Production (Node)

See `docs/deploy-hostinger-vps.md` for VPS setup. Build and start:

```bash
pnpm build
pnpm start
```

Copy `.env.example` to `.env` and configure Supabase and auth secrets — never commit real secrets.
