/**
 * Die Vercel-Funktion api/[...slug].ts muss laden, sonst ist Hub-SSO tot
 * (zebotools.ch/tools?error=sso_mint&status=500, /api/health ebenfalls 500).
 * Aufruf: npx tsx scripts/check-api-boot.ts
 */
import { readFileSync } from 'node:fs'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

const apiSrc = readFileSync(new URL('../api/[...slug].ts', import.meta.url), 'utf8')
const aiSrc = readFileSync(new URL('../lib/ai.ts', import.meta.url), 'utf8')

if (!apiSrc.includes("route === 'hub-sso'")) fail('hub-sso-Route fehlt')

const ssoStart = apiSrc.indexOf("route === 'hub-sso'")
const ssoBlock = apiSrc.slice(ssoStart, apiSrc.indexOf("route === 'public-shared'", ssoStart))
if (!ssoBlock.includes('createCustomToken')) fail('hub-sso mintet kein Token')
if (/gateAi|assertCanUseAi|assertAiAllowed|quoteAiFor/.test(ssoBlock)) {
  fail('hub-sso darf keine KI-Punkte prüfen — Anmeldung muss ohne Punkte gehen')
}

if (/Promise<\{\s*Array</.test(aiSrc)) {
  fail('lib/ai.ts: ungültiger Promise<{ Array<…> }>-Typ — API startet dann nicht (esbuild)')
}

const mod = await import('../api/[...slug].ts')
if (typeof mod.default !== 'function') fail('API-Handler exportiert keine Funktion')

console.log('OK: API startet, hub-sso mintet ohne KI-Punkte')
