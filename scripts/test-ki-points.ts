/**
 * KI-Punkte (lib/ai-authorize.ts) mit gemocktem Hub: npx tsx scripts/test-ki-points.ts
 */
import assert from 'node:assert/strict'
import { assertAiAllowedFor, settleAiRequest } from '../lib/ai-authorize.js'
import { currentAiContext, meterAiRequest, recordGeminiUsage } from '../lib/ai-usage-ledger.js'
import { MASTER_EMAIL } from '../lib/roles.js'
import type { UserProfile } from '../lib/firestore.js'

type Call = { path: string; body: Record<string, unknown> }
const calls: Call[] = []
let reply: (path: string) => unknown = () => null

globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const path = new URL(String(url)).pathname
  calls.push({ path, body: JSON.parse(String(init?.body ?? '{}')) })
  const data = reply(path)
  if (data === null) throw new Error('offline')
  return new Response(JSON.stringify(data), { status: 200 })
}) as typeof fetch

const teacher = (email: string) =>
  ({ id: 'u1', role: 'teacher', email, classIds: [] }) as unknown as UserProfile
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function inRequest(route: string, fn: () => Promise<void>) {
  await new Promise<void>((resolve, reject) => {
    setImmediate(() => {
      meterAiRequest(route)
      fn().then(resolve, reject)
    })
  })
}

async function main() {
  process.env.AI_USAGE_INGEST_SECRET = 'test'
  delete process.env.VERCEL

  reply = () => ({ allowed: false, reason: 'unknown_teacher' })
  await inRequest('tts', async () => {
    await assert.rejects(assertAiAllowedFor(teacher('niemand@test.invalid')), /nicht freigeschaltet/)
  })
  assert.equal(calls[0].body.app, 'zebla')
  console.log('✔ unbekannte Lehrperson gesperrt')

  reply = () => ({ allowed: false, reason: 'no_credits', message: 'Du hast keine KI-Punkte mehr.' })
  await inRequest('tts', async () => {
    await assert.rejects(assertAiAllowedFor(teacher('leer@test.invalid')), /keine KI-Punkte/)
  })
  console.log('✔ 0 Punkte → Klartext')

  reply = () => null
  await inRequest('tts', async () => {
    await assertAiAllowedFor(teacher(MASTER_EMAIL))
  })
  await inRequest('tts', async () => {
    await assert.rejects(assertAiAllowedFor(teacher('lp2@test.invalid')), /nicht geprüft/)
  })
  console.log('✔ Hub weg: Master erlaubt, Lehrperson gesperrt')

  calls.length = 0
  reply = (path) => (path === '/api/ai/authorize' ? { allowed: true, reservationId: 'r1' } : { ok: true })
  await inRequest('film-storyboard-still', async () => {
    await assertAiAllowedFor(teacher('lp@test.invalid'))
    await assertAiAllowedFor(teacher('lp@test.invalid'))
    assert.equal(currentAiContext()?.reservationId, 'r1')
    recordGeminiUsage('flux', 'flux-kontext-pro', null, { units: 1, unitType: 'image' })
    settleAiRequest(10)
    settleAiRequest(10)
  })
  await tick(200)
  const authorizes = calls.filter((c) => c.path === '/api/ai/authorize')
  const ledger = calls.filter((c) => c.path === '/api/ai-usage')
  const settles = calls.filter((c) => c.path === '/api/ai/settle')
  assert.equal(authorizes.length, 1)
  assert.equal(authorizes[0].body.feature, 'film-storyboard-still')
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].body.reservationId, 'r1')
  assert.equal(ledger[0].body.model, 'flux-kontext-pro')
  assert.equal(settles.length, 1)
  assert.equal(settles[0].body.reservationId, 'r1')
  console.log('✔ eine Reservation pro Klick, FLUX im Verbrauchsbuch, Rest einmal freigegeben')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
