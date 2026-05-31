/**
 * Prüft im echten Chromium, ob fa-AF-Stimmen verfügbar sind und TTS startet.
 * Aufruf: node scripts/check-fa-tts.mjs
 */
import { chromium } from 'playwright'

const SAMPLE = 'سلام، چطور هستید؟'

async function loadVoices(page) {
  return page.evaluate(async () => {
    const wait = () =>
      new Promise((resolve) => {
        const existing = speechSynthesis.getVoices()
        if (existing.length) return resolve(existing)
        let timer
        const done = () => {
          const v = speechSynthesis.getVoices()
          if (v.length) {
            speechSynthesis.onvoiceschanged = null
            clearTimeout(timer)
            resolve(v)
          }
        }
        speechSynthesis.onvoiceschanged = done
        timer = setTimeout(() => resolve(speechSynthesis.getVoices()), 1000)
      })
    const raw = await wait()
    return raw.map((v) => ({ name: v.name, lang: v.lang, default: v.default, localService: v.localService }))
  })
}

async function trySpeak(page, locale, voiceName) {
  return page.evaluate(
    async ({ text, locale, voiceName }) => {
      const voices = speechSynthesis.getVoices()
      const voice = voiceName
        ? voices.find((v) => v.name === voiceName)
        : voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(locale.toLowerCase()))

      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text)
        u.lang = voice?.lang.replace('_', '-') ?? locale
        if (voice) u.voice = voice
        let started = false
        const t0 = performance.now()
        u.onstart = () => {
          started = true
        }
        u.onend = () =>
          resolve({
            ok: started,
            ms: Math.round(performance.now() - t0),
            lang: u.lang,
            voice: voice?.name ?? null,
          })
        u.onerror = (e) =>
          resolve({
            ok: false,
            error: e.error,
            ms: Math.round(performance.now() - t0),
            lang: u.lang,
            voice: voice?.name ?? null,
          })
        speechSynthesis.speak(u)
        setTimeout(() => {
          if (!started) {
            resolve({
              ok: false,
              error: 'timeout-no-start',
              ms: Math.round(performance.now() - t0),
              lang: u.lang,
              voice: voice?.name ?? null,
            })
          }
        }, 4000)
      })
    },
    { text: SAMPLE, locale, voiceName },
  )
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

console.log('=== Zebla TTS-Check (Chromium, headless) ===\n')

const voices = await loadVoices(page)
const faVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('fa'))
console.log(`Stimmen gesamt: ${voices.length}`)
console.log(`Persisch/Dari (fa*): ${faVoices.length}`)
for (const v of faVoices) {
  console.log(`  - ${v.name} (${v.lang})`)
}
if (faVoices.length === 0) {
  console.log('  (keine fa-Stimmen in diesem Chromium — auf deinem PC mit Edge kann es anders sein)')
}

console.log('\nSprachversuche:')
for (const locale of ['fa-AF', 'fa-IR', 'fa']) {
  const result = await trySpeak(page, locale, null)
  console.log(
    `  ${locale}: ${result.ok ? 'OK' : 'FEHLER'} (${result.ms} ms, Stimme: ${result.voice ?? '—'}, Fehler: ${result.error ?? '—'})`,
  )
}

if (faVoices[0]) {
  const result = await trySpeak(page, faVoices[0].lang, faVoices[0].name)
  console.log(
    `\nErste fa-Stimme (${faVoices[0].name}): ${result.ok ? 'OK' : 'FEHLER'} (${result.ms} ms)`,
  )
}

// Production bundle check
const res = await fetch('https://zebla.vercel.app/')
const html = await res.text()
const m = html.match(/\/assets\/index-[^"]+\.js/)
let deployOk = false
if (m) {
  const js = await fetch(`https://zebla.vercel.app${m[0]}`).then((r) => r.text())
  deployOk = js.includes('fa-AF') && js.includes('fa-IR')
}
console.log(`\nProduction-Deploy enthält Fix: ${deployOk ? 'ja' : 'nein'}`)

await browser.close()
