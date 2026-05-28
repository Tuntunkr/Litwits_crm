/**
 * Entry for running the TanStack Start SSR bundle on any Node host (Hostinger VPS, etc.).
 * Built output: dist/server/server.js exposes default { fetch(Request) => Response }.
 *
 * After `pnpm build`:
 *   NODE_ENV=production PORT=3000 node ./node_modules/srvx/bin/srvx.mjs scripts/production-server.mjs
 * Or: pnpm start
 */
import serverEntry from '../dist/server/server.js'

const handler =
  serverEntry && typeof serverEntry.fetch === 'function'
    ? serverEntry
    : serverEntry?.default

if (!handler || typeof handler.fetch !== 'function') {
  console.error(
    'dist/server/server.js must export { fetch }. Run `pnpm build` first.',
  )
  process.exit(1)
}

export default handler
