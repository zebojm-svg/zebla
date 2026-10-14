/**
 * Bild ändern: Dumb conveyor — Katalog, Hinweis, Packzettel. Keine Stichwörter.
 * Aufruf: npx tsx scripts/check-film-still-pack.ts
 */
import { readFileSync } from 'node:fs'
import type { Dialog, FilmInventory } from '../shared/types.ts'
import type { FilmPlacement, FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.ts'
import {
  catalogForPlanner,
  parseStillEditPackzettel,
  pickStillCatalogImages,
  stillEditCatalog,
  stillEditFigures,
  stillEditHarvestNoteDe,
  stillEditLineDe,
  stillEditPlannerChatJsonOpts,
  stillEditPlannerErrorDe,
  stillEditPlannerGoogleHttpStatus,
  stillEditPlannerMessages,
  stillEditPlannerRetryUser,
  stillEditPlannerStatusDe,
  stillEditPlannerSystem,
  stillNumberInScene,
  stillPackzettelAttachEn,
  stillEditTimeoutHintDe,
  isStillEditPlannerFlashFallbackError,
  isStillEditPlannerQuotaError,
  runStillEditPlannerModelAttempts,
  withStillEditPlannerQuotaRetries,
  STILL_EDIT_PLAN_CLIENT_TIMEOUT_MS,
  STILL_EDIT_PLANNER_EMPTY_DE,
  STILL_EDIT_PLANNER_ERROR_DE,
  STILL_EDIT_PLANNER_FALLBACK_MODEL,
  STILL_EDIT_PLANNER_GOOGLE_DE,
  STILL_EDIT_PLANNER_HTTP_BUDGET_MS,
  STILL_EDIT_PLANNER_INVALID_DE,
  STILL_EDIT_PLANNER_MODEL,
  STILL_EDIT_PLANNER_QUOTA_BACKOFF_MS,
  STILL_EDIT_PLANNER_QUOTA_DE,
  STILL_EDIT_PLANNER_QUOTA_RETRIES,
  STILL_EDIT_PLANNER_RETRY_TIMEOUT_MS,
  STILL_EDIT_PLANNER_TIMEOUT_DE,
  STILL_EDIT_PLANNER_TIMEOUT_MS,
  STILL_EDIT_PLANNER_WAIT_AFTER_MS,
  STILL_EDIT_PLANNER_WAIT_DE,
  type StillCatalogItem,
} from '../shared/film-still-pack.ts'
import { clientTimeoutMessage } from '../shared/api-timeout.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

function person(name: string, url: string, x: number): FilmPlacement {
  return {
    name,
    poseId: 'sitting',
    poseHint: 'sitzt',
    depth: 'mid',
    x,
    scale: 1,
    flip: false,
    match: 'reuse',
    matchNoteDe: '',
    imageUrl: url,
  }
}

function panel(partial: Partial<FilmStoryboardPanel> & Pick<FilmStoryboardPanel, 'id'>): FilmStoryboardPanel {
  return {
    sceneId: 'kitchen',
    sceneIndex: 0,
    panelIndex: 1,
    sectionId: 's-kitchen',
    lineIds: [],
    caption: '',
    imageCue: '',
    soundCue: '',
    speechCue: '',
    settingHint: 'Küche',
    placements: [],
    background: { hint: 'Küche', match: 'missing', matchNoteDe: '' },
    shot: 'wide',
    ...partial,
  }
}

const stove = panel({
  id: 'stove',
  panelIndex: 1,
  lineIds: ['k-stove'],
  caption: 'Ramo stellt den Kessel auf den Herd.',
  imageCue: 'Kessel auf dem Herd',
  stillUrl: 'https://example.com/stove.png',
  shot: 'insert',
  propIds: ['kanne-1'],
  placements: [person('Ramo', 'https://example.com/ramo.png', 40)],
})

const table = panel({
  id: 'table',
  panelIndex: 2,
  lineIds: ['k-table'],
  caption: 'So, das Wasser kann kochen.',
  imageCue: 'Ramo sitzt mit Gästen am Tisch, Kanne auf dem Tisch',
  stillUrl: 'https://example.com/table-guests.png',
  shot: 'wide',
  propIds: ['kanne-1'],
  placements: [
    person('Ramo', 'https://example.com/ramo.png', 50),
    person('Khan', 'https://example.com/khan.png', 20),
    person('Ubai', 'https://example.com/ubai.png', 80),
  ],
  background: {
    hint: 'Küche',
    imageUrl: 'https://example.com/kitchen-empty.png',
    match: 'reuse',
    matchNoteDe: '',
  },
})

const board: FilmStoryboard = {
  version: 1,
  source: 'rules',
  scenes: [{ id: 'kitchen', title: 'Küche', noteDe: '' }],
  panels: [stove, table],
  updatedAt: '2026-01-01',
}

const inventory: FilmInventory = {
  people: [{ name: 'Ramo' }, { name: 'Khan' }, { name: 'Ubai' }],
  places: [{ key: 'kitchen', labelDe: 'Küche' }],
  props: [{ id: 'kanne-1', nameDe: 'Kanne' }],
}

const dialog: Dialog = {
  id: 'd-pack',
  userId: 'u1',
  title: 'Tee',
  sourceLanguage: 'de',
  targetLanguage: 'fa',
  length: 'short',
  sections: [
    {
      id: 's-kitchen',
      title: 'Küche',
      lines: [
        {
          id: 'k-table',
          speaker: 'Ramo',
          text: 'So, das Wasser kann kochen.',
          nativeText: 'So, das Wasser kann kochen.',
        },
      ],
    },
  ],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

if (stillNumberInScene(board, table) !== 2) fail('Bildnummer ist die Stelle in der Szene (2)')

const catalog = stillEditCatalog({ board, panel: table, inventory })
const byKind = (kind: StillCatalogItem['kind']) => catalog.filter((it) => it.kind === kind)

if (!byKind('current').some((it) => it.id === 'current-table' && it.url === table.stillUrl)) {
  fail('Katalog nennt das aktuelle Still mit id')
}
if (!catalog.some((it) => it.label.includes('aktuelles Still') && it.label.includes('Bild 2'))) {
  fail('aktuelles Still ehrlich beschriftet (Bildnummer)')
}
if (!byKind('still').some((it) => it.id === 'still-stove' && it.url === stove.stillUrl)) {
  fail('Katalog enthält andere Stills der Szene')
}
if (!catalog.some((it) => it.label.includes('Ramo') && it.label.includes('Gesicht'))) {
  fail('Katalog: Ramo Gesicht/Kleidung')
}
if (!catalog.some((it) => it.id === 'person-khan')) fail('Katalog: Khan-Stammbild')
if (!catalog.some((it) => /Küche\/Herd/.test(it.label))) {
  fail('Katalog: Küche/Herd pickbar')
}
if (!catalog.some((it) => it.kind === 'prop' && it.label.includes('Kanne') && it.url === stove.stillUrl)) {
  fail('Katalog: Kanne aus anderem Küchenbild, nicht vom Tisch mit Gästen')
}
const kanne = catalog.find((it) => it.id === 'prop-kanne-1')
if (kanne?.url === table.stillUrl) {
  fail('Kanne darf nicht das aktuelle Tischbild sein — Gemini kopiert sonst die Gäste')
}

const figures = stillEditFigures(board, table, inventory)
if (!figures.includes('Ramo') || !figures.includes('Khan')) fail('Figuren stehen im Planner-Request')

const hint = 'mach dass ramo alleine am Herd steht'
const { system, user } = stillEditPlannerMessages({
  stillNumber: stillNumberInScene(board, table),
  panelId: table.id,
  userHint: hint,
  dialogDe: stillEditLineDe(table, dialog),
  figures,
  place: table.settingHint,
  catalog,
  styleLabel: 'lebendige Illustration',
})
if (!user.includes('Bild Nummer 2')) fail('Planner-Request nennt die Bildnummer')
if (!user.includes(`id ${table.id}`)) fail('Planner-Request nennt die Bild-id')
if (!user.includes(hint)) fail('Planner-Request reicht den Hinweis weiter')
if (!user.includes('So, das Wasser kann kochen')) fail('Planner-Request hat den deutschen Dialog')
if (!user.includes('id=current-table')) fail('Planner-Request listet Katalog-ids')
if (!user.includes('aktuelles Still')) fail('Planner-Request listet Katalog-Labels')
if (!user.includes('person-ramo') && !user.includes('Ramo Gesicht')) {
  fail('Planner-Request zeigt Ramo im Katalog')
}
if (/https?:\/\//i.test(user) || /data:image/i.test(user) || /base64,/i.test(user)) {
  fail('Planner-Request darf keine Bild-URLs oder Bytes enthalten')
}
const plannerOnly = catalogForPlanner(catalog)
if (plannerOnly.some((it) => 'url' in it && (it as { url?: string }).url)) {
  fail('catalogForPlanner darf keine url-Felder behalten')
}
if (JSON.stringify(plannerOnly).includes('example.com')) {
  fail('Planner-Katalog ist Text (id/label), keine Foto-Adresse')
}
const hugePng = `${'A'.repeat(4000)}`
const withBytes: StillCatalogItem[] = [
  {
    id: 'person-ramo',
    label: `Ramo Gesicht https://cdn.example.com/ramo.png data:image/png;base64,${hugePng}`,
    url: `data:image/png;base64,${hugePng}`,
    kind: 'person',
  },
]
const bytesUser = stillEditPlannerMessages({
  stillNumber: 2,
  panelId: table.id,
  userHint: hint,
  dialogDe: stillEditLineDe(table, dialog),
  figures,
  place: table.settingHint,
  catalog: withBytes,
  styleLabel: 'lebendige Illustration',
}).user
if (bytesUser.includes(hugePng) || bytesUser.includes('base64') || bytesUser.includes('data:image')) {
  fail('Planner bekommt keine PNG-Bytes, auch wenn der Katalog eine data-URL hat')
}
if (!bytesUser.includes('id=person-ramo')) fail('Planner sieht die id trotz gestrippter URL')
const retryAsk = stillEditPlannerRetryUser({
  stillNumber: 2,
  panelId: table.id,
  userHint: hint,
  dialogDe: stillEditLineDe(table, dialog),
  figures,
  place: table.settingHint,
  catalog,
})
if (!retryAsk.includes('imageIds') || !retryAsk.includes('person-ramo')) {
  fail('Zweiter Planner-Ask verlangt ids aus dem Katalog')
}
if (/https?:\/\//i.test(retryAsk)) fail('Zweiter Ask ohne Foto-URLs')
if (!system.includes('"imagePrompt"') || !system.includes('"imageIds"')) {
  fail('Drehbuch-KI soll { imagePrompt, imageIds } liefern')
}
if (!system.includes('aktuelle Still NICHT') && !system.includes('aktuelles Still NICHT')) {
  fail('Drehbuch-KI: neue Stellung ohne aktuelles Still')
}
if (!system.includes('fröhlicher')) {
  fail('Drehbuch-KI: Mini-Retusche mit aktuellem Still')
}

const restagePack = parseStillEditPackzettel({
  imagePrompt: 'Ramo alone at the stove, same kettle, new blocking, no guests.',
  imageIds: ['person-ramo', 'still-stove', 'prop-kanne-1', 'current-table', 'unknown-id'],
})
const restagePicked = pickStillCatalogImages(catalog, restagePack.imageIds)
if (restagePicked.some((it) => it.id === 'unknown-id')) fail('unbekannte id überspringen')
if (!restagePicked.some((it) => it.id === 'person-ramo')) fail('gelistetes Ramo-Foto mitschicken')
if (!restagePicked.some((it) => it.url === stove.stillUrl)) fail('gelistetes Herd/Kannen-Foto mitschicken')

const retouch = pickStillCatalogImages(catalog, ['current-table', 'person-ramo'])
if (!retouch.some((it) => it.id === 'current-table')) fail('Retusche darf das aktuelle Still listen')

const onlyListed = pickStillCatalogImages(catalog, ['person-ramo', 'prop-kanne-1'])
if (onlyListed.some((it) => it.id === 'current-table')) {
  fail('Werkzeug schickt nur gelistete ids — nicht von allein das Tischbild')
}
if (onlyListed.some((it) => it.id === 'person-khan')) {
  fail('Werkzeug schickt Khan nicht, wenn die Drehbuch-KI ihn nicht listet')
}

try {
  parseStillEditPackzettel({ imageIds: ['person-ramo'] })
  fail('Packzettel ohne imagePrompt ist ein Fehler')
} catch (err) {
  if (!(err instanceof Error) || err.message !== STILL_EDIT_PLANNER_INVALID_DE) {
    fail('Fehlender Prompt ist ungültiger Packzettel auf Deutsch')
  }
}

{
  const opts = stillEditPlannerChatJsonOpts(STILL_EDIT_PLANNER_MODEL, STILL_EDIT_PLANNER_TIMEOUT_MS)
  if ('responseSchema' in opts) {
    fail('Planner-Request an chatJson darf kein responseSchema schicken')
  }
  const encoded = JSON.stringify(opts)
  if (encoded.includes('responseSchema') || encoded.includes('SchemaType')) {
    fail('chatJson-Opts ohne SDK-Schema — Google 400 auf lite und flash')
  }
  if (opts.model !== STILL_EDIT_PLANNER_MODEL || opts.timeoutMessage !== STILL_EDIT_PLANNER_TIMEOUT_DE) {
    fail('Planner-Opts bleiben kurzes JSON, Timeout auf Deutsch')
  }
}
const fromFence = parseStillEditPackzettel(
  'Klar.\n```json\n{"imagePrompt":"Ramo at the stove","imageIds":["person-ramo"]}\n```\n',
)
if (fromFence.imagePrompt !== 'Ramo at the stove' || fromFence.imageIds[0] !== 'person-ramo') {
  fail('Packzettel aus Markdown-Zaun lesen')
}
const fromFenceNoLang = parseStillEditPackzettel(
  '```\n{"imagePrompt":"Ramo alone at the stove","imageIds":["person-ramo","still-stove"]}\n```',
)
if (
  fromFenceNoLang.imagePrompt !== 'Ramo alone at the stove' ||
  fromFenceNoLang.imageIds.length !== 2
) {
  fail('Packzettel aus Zaun ohne json-Marke lesen')
}
const fromAlias = parseStillEditPackzettel({
  prompt: 'Ramo alone, no guests.',
  ids: ['person-ramo', 'prop-kanne-1'],
})
if (!fromAlias.imagePrompt.includes('Ramo') || fromAlias.imageIds.length !== 2) {
  fail('Aliase prompt/ids auf imagePrompt/imageIds normieren')
}
const fromSnake = parseStillEditPackzettel({
  packzettel: { image_prompt: 'same kettle', image_ids: ['still-stove'] },
})
if (fromSnake.imagePrompt !== 'same kettle' || fromSnake.imageIds[0] !== 'still-stove') {
  fail('Aliase image_prompt/image_ids und packzettel-Hülle')
}
const extraKeys = parseStillEditPackzettel({
  imagePrompt: 'ok',
  imageIds: ['person-ramo'],
  note: 'ignore me',
  temperature: 0.2,
})
if (extraKeys.imagePrompt !== 'ok' || extraKeys.imageIds[0] !== 'person-ramo') {
  fail('Zusätzliche JSON-Felder stören den Packzettel nicht')
}
const emptyIds = parseStillEditPackzettel({ imagePrompt: 'Ramo at the stove', imageIds: [] })
if (emptyIds.imagePrompt !== 'Ramo at the stove' || emptyIds.imageIds.length !== 0) {
  fail('Prompt ohne ids bleibt parsebar — Retry macht der Planner')
}

if (STILL_EDIT_PLANNER_TIMEOUT_MS < 25_000 || STILL_EDIT_PLANNER_TIMEOUT_MS > 35_000) {
  fail('Planner-Timeout 25–35 s, nicht 18 s — Quota-Warten kürzt über das HTTP-Budget')
}
if (STILL_EDIT_PLANNER_RETRY_TIMEOUT_MS > 20_000) fail('Zweiter Ask kürzer als der erste')
if (STILL_EDIT_PLANNER_QUOTA_BACKOFF_MS < 15_000 || STILL_EDIT_PLANNER_QUOTA_BACKOFF_MS > 25_000) {
  fail('Quota-Warten 15–25 s')
}
if (STILL_EDIT_PLANNER_QUOTA_RETRIES < 1 || STILL_EDIT_PLANNER_QUOTA_RETRIES > 2) {
  fail('Quota 1–2 Wiederholungen im gleichen Klick')
}
if (STILL_EDIT_PLANNER_HTTP_BUDGET_MS >= 60_000) fail('Packzettel-HTTP unter 60 s')
if (STILL_EDIT_PLAN_CLIENT_TIMEOUT_MS >= 60_000) fail('Client bleibt unter 60 s')
if (!STILL_EDIT_PLANNER_TIMEOUT_DE.includes('Zeitlimit')) fail('Zeitlimit-Satz auf Deutsch')
if (!STILL_EDIT_PLANNER_EMPTY_DE.includes('leere Antwort')) fail('Leere-Antwort-Satz auf Deutsch')
if (!STILL_EDIT_PLANNER_INVALID_DE.includes('ungültiger Packzettel')) {
  fail('Ungültiger-Packzettel-Satz auf Deutsch')
}
if (stillEditPlannerErrorDe(new Error('Zeitüberschreitung bei der KI')) !== STILL_EDIT_PLANNER_TIMEOUT_DE) {
  fail('Timeout wird als Zeitlimit erklärt')
}
if (stillEditPlannerErrorDe(new Error('Keine Antwort von der KI erhalten.')) !== STILL_EDIT_PLANNER_EMPTY_DE) {
  fail('Leere KI-Antwort wird erklärt')
}
if (stillEditPlannerErrorDe(new Error('JSON der KI war ungültig.')) !== STILL_EDIT_PLANNER_INVALID_DE) {
  fail('Kaputtes JSON wird als ungültiger Packzettel erklärt')
}
const sdk400 =
  '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent: [400 Bad Request] Invalid JSON payload received. Unknown name "responseSchema" at \'generation_config\': Cannot find field.'
if (stillEditPlannerGoogleHttpStatus(sdk400) !== 400) fail('SDK 400 aus [400 Bad Request]')
if (stillEditPlannerErrorDe(new Error(sdk400)) !== stillEditPlannerStatusDe(400)) {
  fail('Google 400 ist (400), nicht ungültiger Packzettel und nicht englische Payload')
}
if (stillEditPlannerErrorDe(new Error(sdk400)).includes('payload') || stillEditPlannerErrorDe(new Error(sdk400)).includes('http')) {
  fail('Keine englische Google-Meldung und keine URL in der UI')
}
if (
  stillEditPlannerErrorDe(new Error('Invalid JSON payload received. Unknown name responseMimeType')) !==
  stillEditPlannerStatusDe(400)
) {
  fail('Invalid JSON payload ohne Klammer-Status ist (400)')
}
const quotaRaw =
  'Quota exceeded for aiplatform.googleapis.com/generate_content_requests_per_minute_per_project_per_base_model with base model: gemini-2.5-flash. Please submit a quota increase request. https://cloud.google.com/vertex-ai/docs/generative-ai/quotas-genai'
if (!isStillEditPlannerQuotaError(quotaRaw)) fail('Vertex-Quota ist echte Quota')
if (!isStillEditPlannerQuotaError('429 Too Many Requests')) fail('429 ist Quota')
if (!isStillEditPlannerQuotaError('RESOURCE_EXHAUSTED')) fail('RESOURCE_EXHAUSTED ist Quota')
const sdk500 =
  '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [500 Internal Server Error]'
if (isStillEditPlannerQuotaError(sdk500)) fail('Google-URL allein ist keine Quota')
if (stillEditPlannerErrorDe(new Error(sdk500)) === STILL_EDIT_PLANNER_QUOTA_DE) {
  fail('500 nicht als gerade voll zeigen')
}
if (stillEditPlannerGoogleHttpStatus(sdk500) !== 500) fail('SDK 500 aus [500 Internal Server Error]')
if (stillEditPlannerErrorDe(new Error(sdk500)) !== stillEditPlannerStatusDe(500)) {
  fail('500 ist (500), nicht der Satz ohne Klammer')
}
if (stillEditPlannerErrorDe(new Error(sdk500)).includes('Internal Server')) {
  fail('Keine englische 500-Meldung in der UI')
}
if (stillEditPlannerErrorDe(new Error(sdk500)) === STILL_EDIT_PLANNER_ERROR_DE) {
  fail('Unklassifizierter Google-Dump darf nicht den Satz ohne Grund zeigen')
}
const deadline =
  'Error fetching from https://generativelanguage.googleapis.com/v1beta: Deadline Exceeded'
if (stillEditPlannerErrorDe(new Error(deadline)) !== STILL_EDIT_PLANNER_TIMEOUT_DE) {
  fail('Deadline Exceeded ist Zeitlimit, nicht voll')
}
if (
  /tts|image/i.test(STILL_EDIT_PLANNER_MODEL) ||
  !STILL_EDIT_PLANNER_MODEL.includes('flash-lite')
) {
  fail('Planner ist günstiges Text-Flash, nicht TTS und nicht Bild')
}
if (
  /tts|image|lite/i.test(STILL_EDIT_PLANNER_FALLBACK_MODEL) ||
  STILL_EDIT_PLANNER_FALLBACK_MODEL !== 'gemini-2.5-flash'
) {
  fail('Fallback nach lite ist gemini-2.5-flash')
}
const quota = stillEditPlannerErrorDe(new Error(quotaRaw))
if (quota !== STILL_EDIT_PLANNER_QUOTA_DE) fail('Quota wie Probe, ohne URL')
if (quota.includes('http') || quota.includes('ai.google') || quota.includes('cloud.google')) {
  fail('Keine Google-Quota-URL in der UI')
}
if (!quota.includes('Bild ändern')) fail('Quota bleibt «Bild ändern»')
if (!quota.includes('Google ist gerade voll')) fail('Quota-Satz wie bei Probe')
if (stillEditPlannerErrorDe(new Error('Die Drehbuch-KI ist gerade voll. Bitte noch einmal «Bild ändern».')) !== STILL_EDIT_PLANNER_QUOTA_DE) {
  fail('Alter Voll-Satz wird auf Probe-Satz gemappt')
}
if (stillEditTimeoutHintDe(STILL_EDIT_PLANNER_QUOTA_DE) !== STILL_EDIT_PLANNER_QUOTA_DE) {
  fail('Quota-Satz nicht auf Zeitlimit umbiegen')
}
if (stillEditPlannerErrorDe(new Error(STILL_EDIT_PLANNER_ERROR_DE)) !== STILL_EDIT_PLANNER_GOOGLE_DE) {
  fail('Der Satz ohne Klammer bekommt den Grund Google-Fehler')
}
if (stillEditPlannerErrorDe(new Error(STILL_EDIT_PLANNER_TIMEOUT_DE)) !== STILL_EDIT_PLANNER_TIMEOUT_DE) {
  fail('Zeitlimit bleibt Zeitlimit, nicht Quota')
}
if (stillEditPlannerErrorDe(new Error('Kein Storyboard.')) !== 'Kein Storyboard.') {
  fail('Kein Storyboard bleibt der App-Satz, nicht Google-Fehler')
}
if (stillEditPlannerErrorDe(new Error('Failed to fetch')) !== STILL_EDIT_PLANNER_GOOGLE_DE) {
  fail('Netzwerkfehler am Packzettel ist Google-Fehler')
}

{
  const sleeps: number[] = []
  let n = 0
  const recovered = await withStillEditPlannerQuotaRetries(
    async () => {
      n += 1
      if (n < 3) throw new Error('429 Too Many Requests')
      return 'ok'
    },
    { sleep: async (ms) => { sleeps.push(ms) } },
  )
  if (recovered !== 'ok' || n !== 3) fail('Nach zwei 429 noch einmal im gleichen Klick')
  if (
    sleeps.length !== 2 ||
    sleeps.some((ms) => ms !== STILL_EDIT_PLANNER_QUOTA_BACKOFF_MS)
  ) {
    fail('Quota-Backoff 15–25 s, zweimal')
  }
  let timed = 0
  try {
    await withStillEditPlannerQuotaRetries(
      async () => {
        timed += 1
        throw new Error(STILL_EDIT_PLANNER_TIMEOUT_DE)
      },
      { sleep: async () => { fail('Timeout nicht als Quota warten') } },
    )
    fail('Timeout muss den Fehler weitergeben')
  } catch (err) {
    if (!(err instanceof Error) || err.message !== STILL_EDIT_PLANNER_TIMEOUT_DE) {
      fail('Timeout bleibt Zeitlimit')
    }
  }
  if (timed !== 1) fail('Timeout nicht wiederholen')
}

if (!isStillEditPlannerFlashFallbackError(new Error(STILL_EDIT_PLANNER_EMPTY_DE))) {
  fail('Leere lite-Antwort → Flash')
}
if (!isStillEditPlannerFlashFallbackError(new Error(STILL_EDIT_PLANNER_INVALID_DE))) {
  fail('Ungültiger lite-Packzettel → Flash')
}
if (!isStillEditPlannerFlashFallbackError(new Error('404 Not Found models/gemini-2.5-flash-lite is not found'))) {
  fail('404 lite → Flash')
}
if (!isStillEditPlannerFlashFallbackError(new Error(sdk500))) {
  fail('500 lite → Flash')
}
if (!isStillEditPlannerFlashFallbackError(new Error(sdk400))) {
  fail('400 lite → Flash')
}
if (isStillEditPlannerFlashFallbackError(new Error('GEMINI_API_KEY ist nicht gesetzt. Bitte in Vercel einen Google AI Studio Key eintragen.'))) {
  fail('Fehlender Schlüssel nicht auf Flash umbiegen')
}
if (isStillEditPlannerFlashFallbackError(new Error('Kein Storyboard.'))) {
  fail('Kein Storyboard nicht auf Flash umbiegen')
}

{
  const order: string[] = []
  const fromEmpty = await runStillEditPlannerModelAttempts({
    catalogLen: 3,
    primary: STILL_EDIT_PLANNER_MODEL,
    fallback: STILL_EDIT_PLANNER_FALLBACK_MODEL,
    call: async (model) => {
      order.push(model)
      if (model.includes('lite')) {
        return { imagePrompt: 'Ramo at the stove', imageIds: [] }
      }
      return { imagePrompt: 'Ramo alone at the stove', imageIds: ['person-ramo'] }
    },
  })
  if (fromEmpty.imageIds[0] !== 'person-ramo') fail('Leere ids von lite: gleicher Prompt auf Flash')
  if (order.join(',') !== `${STILL_EDIT_PLANNER_MODEL},${STILL_EDIT_PLANNER_FALLBACK_MODEL}`) {
    fail('Erst lite, dann flash')
  }
}

{
  const order: string[] = []
  const fromInvalid = await runStillEditPlannerModelAttempts({
    catalogLen: 3,
    primary: STILL_EDIT_PLANNER_MODEL,
    fallback: STILL_EDIT_PLANNER_FALLBACK_MODEL,
    call: async (model) => {
      order.push(model)
      if (model.includes('lite')) throw new Error(STILL_EDIT_PLANNER_INVALID_DE)
      return { imagePrompt: 'Ramo alone at the stove', imageIds: ['person-ramo', 'still-stove'] }
    },
  })
  if (fromInvalid.imageIds.length !== 2) fail('Ungültiges lite-JSON: gleicher Prompt auf Flash')
  if (order[0] !== STILL_EDIT_PLANNER_MODEL || order[1] !== STILL_EDIT_PLANNER_FALLBACK_MODEL) {
    fail('Ungültig: lite dann flash')
  }
}

{
  const order: string[] = []
  const from404 = await runStillEditPlannerModelAttempts({
    catalogLen: 1,
    primary: STILL_EDIT_PLANNER_MODEL,
    fallback: STILL_EDIT_PLANNER_FALLBACK_MODEL,
    call: async (model) => {
      order.push(model)
      if (model.includes('lite')) throw new Error('404 Not Found is not found')
      return { imagePrompt: 'ok', imageIds: ['person-ramo'] }
    },
  })
  if (from404.imagePrompt !== 'ok') fail('404 lite: Flash liefert den Packzettel')
  if (order.length !== 2) fail('404 lite ruft Flash')
}

const attach = stillPackzettelAttachEn(onlyListed.map((it) => it.label))
if (/exact people|same seats/i.test(attach)) {
  fail('Packzettel hängt keine Extra-Sperre keep EXACT people / same seats an')
}
if (!attach.includes('1.') || !attach.includes('Ramo')) {
  fail('Anhang beschriftet die gelisteten Fotos')
}

const note = stillEditHarvestNoteDe(hint, onlyListed)
if (!note.includes('Packzettel')) fail('Hinweis nach Bild ändern nennt den Packzettel')
if (note.includes('gleiche Plätze')) fail('Werkzeug behauptet nicht von allein gleiche Plätze')

const timeoutHint = stillEditTimeoutHintDe('Leere Antwort vom Server (504).')
if (!timeoutHint.includes('Bild ändern')) {
  fail('Leere Server-Antwort bei Bild ändern nennt den Knopf, nicht Szene erzeugen')
}
if (!timeoutHint.includes('Zeitlimit')) fail('504 bei Bild ändern nennt Zeitlimit')
if (timeoutHint.includes('Diese Szene erzeugen')) {
  fail('Bild-ändern-Timeout darf nicht auf Diese Szene erzeugen zeigen')
}
const packHint = stillEditTimeoutHintDe(STILL_EDIT_PLANNER_ERROR_DE)
if (packHint !== STILL_EDIT_PLANNER_GOOGLE_DE) {
  fail('Staler Satz ohne Klammer zeigt Google-Fehler')
}
if (stillEditTimeoutHintDe(STILL_EDIT_PLANNER_TIMEOUT_DE) !== STILL_EDIT_PLANNER_TIMEOUT_DE) {
  fail('Zeitlimit-Satz nicht umbiegen')
}
if (stillEditTimeoutHintDe(STILL_EDIT_PLANNER_EMPTY_DE) !== STILL_EDIT_PLANNER_EMPTY_DE) {
  fail('Leere-Antwort-Satz nicht umbiegen')
}
if (
  stillEditTimeoutHintDe('Anfrage fehlgeschlagen (500). Prüfe GEMINI_API_KEY auf Vercel.') !==
  stillEditPlannerStatusDe(500)
) {
  fail('500 ohne Server-Text ist (500), nicht der Satz ohne Klammer')
}

const stillFnSrc = readFileSync(new URL('../lib/film-storyboard.ts', import.meta.url), 'utf8')
if (!stillFnSrc.includes('planFilmPanelStillEdit')) {
  fail('Packzettel hat eine eigene Funktion, nicht nur im Bild-Aufruf')
}
const stillFn = stillFnSrc.slice(
  stillFnSrc.indexOf('export async function stillFilmPanel'),
  stillFnSrc.indexOf('export async function saveFilmPlan'),
)
if (!stillFn.includes('planStillEditPackzettel')) {
  fail('Bild ändern ruft die Drehbuch-KI für den Packzettel')
}
if (!stillFn.includes('packFromClient') || !stillFn.includes('parseStillEditPackzettel')) {
  fail('Bild-Aufruf nimmt den fertigen Packzettel, statt nochmal zu planen')
}
if (!stillFn.includes('stillEditCatalog')) fail('Bild ändern legt den Katalog an')
if (!stillFn.includes('pickStillCatalogImages')) fail('Bild ändern schickt nur gelistete ids')
if (!stillFn.includes('packzettel')) fail('Bild ändern übergibt den Packzettel an die Bild-KI')
if (stillFn.includes('planFilmPanelRefNeeds')) {
  fail('Bild ändern wartet nicht auf den alten Vorlagen-Check')
}
if (
  /correctionRestagesBlocking|RESTAGE_ALONE|peopleKeptInRestage|applyRestageToPanel/.test(stillFn)
) {
  fail('Bild ändern verzweigt nicht über Restage-Stichwörter')
}
if (/\ballein\b|\bam Herd\b|keine Gäste/.test(stillFn)) {
  fail('Bild ändern erkennt nicht allein/am Herd/keine Gäste per Stichwort')
}

const pngSrc = readFileSync(new URL('../lib/film-stills.ts', import.meta.url), 'utf8')
if (!pngSrc.includes('packzettel')) fail('Bild-KI-Aufruf hat den Packzettel-Pfad')
if (!pngSrc.includes('stillPackzettelAttachEn')) {
  fail('Packzettel-Fotos ohne EXACT-people-Sperre')
}
const genFn = pngSrc.slice(pngSrc.indexOf('export async function generateFilmPanelStillImage'))
if (!genFn.includes('if (opts.packzettel)')) fail('Packzettel umgeht stillReferencePack')

const aiSrc = readFileSync(new URL('../lib/ai.ts', import.meta.url), 'utf8')
if (!aiSrc.includes('planStillEditPackzettel')) fail('planStillEditPackzettel ist die Drehbuch-KI')
if (!aiSrc.includes('STILL_EDIT_PLANNER_TIMEOUT_MS')) fail('Planner ist ein kurzer Text-Aufruf')
if (!aiSrc.includes('catalogForPlanner')) fail('Planner bekommt den Text-Katalog, nicht die PNGs')
if (!aiSrc.includes('stillEditPlannerRetryUser')) fail('Leere imageIds: einmal kürzer nachfragen')
if (!aiSrc.includes('STILL_EDIT_PLANNER_MODEL')) fail('Packzettel-Planner ist das günstige Text-Flash, nicht TTS')
if (!aiSrc.includes('STILL_EDIT_PLANNER_FALLBACK_MODEL')) fail('Nach lite kommt gemini-2.5-flash')
if (!aiSrc.includes('runStillEditPlannerModelAttempts')) fail('Leere/ungültige lite-Antwort versucht Flash')
if (!aiSrc.includes('stillEditPlannerChatJsonOpts')) fail('Planner-Request an chatJson ist eine prüfbare Opts-Funktion')
if (aiSrc.includes('SchemaType')) fail('Kein SDK-SchemaType — Google 400 auf lite und flash')
if (aiSrc.includes('STILL_EDIT_PACK_SCHEMA')) fail('Kein Packzettel-responseSchema')
if (!aiSrc.includes('[still-edit-packzettel]')) fail('Roh-Ursache des Packzettels serverseitig loggen')
if (!aiSrc.includes('withStillEditPlannerQuotaRetries')) fail('429 wartet und versucht denselben Klick nochmal')
if (!aiSrc.includes('clipPlannerTimeoutMs')) fail('Quota-Retry bleibt unter dem 60s-HTTP-Budget')
const planStart = aiSrc.indexOf('async function requestStillEditPackzettel')
const planEnd = aiSrc.indexOf('export async function planFilmPanelRefNeeds')
const planFn = aiSrc.slice(planStart, planEnd > planStart ? planEnd : undefined)
if (!planFn.includes('planStillEditPackzettel')) fail('Planner-Funktionen hängen zusammen')
if (planFn.includes('responseSchema') || planFn.includes('STILL_EDIT_PACK_SCHEMA')) {
  fail('Planner-Aufruf an chatJson ohne responseSchema')
}
if (!planFn.includes('stillEditPlannerChatJsonOpts')) {
  fail('Planner reicht stillEditPlannerChatJsonOpts an chatJson')
}
if (planFn.includes('chatJsonWithImages')) {
  fail('Packzettel-Planner darf keine Bilder an Gemini hängen')
}
if (planFn.includes('gemini-2.5-flash-tts')) fail('Planner teilt kein TTS-Kontingent')
if (/flash-image|imagen/i.test(planFn)) fail('Planner ist kein Bildmodell')
if (!stillFnSrc.includes('catalogForPlanner')) {
  fail('Storyboard schickt der Drehbuch-KI den Text-Katalog')
}

const hookSrc = readFileSync(new URL('../src/story/generateSceneStills.ts', import.meta.url), 'utf8')
if (hookSrc.includes('confirmCost')) fail('Bild ändern nicht hinter Kosten-Dialog verstecken')
if (!hookSrc.includes('finally')) fail('Busy nach Fehler zurücksetzen')
if (!hookSrc.includes('stillTimeoutHintDe')) fail('Planner-Fehler auf Deutsch zeigen, nicht schlucken')
if (!hookSrc.includes('stillEditTimeoutHintDe')) {
  fail('Bild ändern zeigt eigenen Timeout-Text, nicht Diese Szene erzeugen')
}
if (!hookSrc.includes('filmStillPlan')) fail('Bild ändern holt zuerst den Packzettel')
if (!hookSrc.includes('Drehbuch-KI schreibt den Packzettel')) {
  fail('Während des Packzettels steht ein Satz unter dem Knopf')
}
if (!hookSrc.includes('STILL_EDIT_PLANNER_WAIT_DE')) {
  fail('Wenn Google voll ist, steht unter dem Knopf: warte kurz')
}
if (!hookSrc.includes('STILL_EDIT_PLANNER_WAIT_AFTER_MS')) {
  fail('Warte-Satz erst wenn der Packzettel länger braucht als ein schnelles JSON')
}
if (!STILL_EDIT_PLANNER_WAIT_DE.includes('Google voll')) fail('Warte-Satz nennt Google voll')
if (STILL_EDIT_PLANNER_WAIT_AFTER_MS < 5_000 || STILL_EDIT_PLANNER_WAIT_AFTER_MS >= STILL_EDIT_PLANNER_QUOTA_BACKOFF_MS) {
  fail('Warte-Satz während der 429-Pause, nicht sofort')
}

const uxSrc = readFileSync(new URL('../src/story/FilmSceneGenerate.tsx', import.meta.url), 'utf8')
if (!uxSrc.includes('Bild ändern')) fail('Knopf Bild ändern bleibt')
if (!uxSrc.includes('placeholder=')) fail('Kurzer Hinweis bleibt das Eingabefeld')
if (!uxSrc.includes('alert-error')) fail('Fehler neben Bild ändern zeigen, nicht nur unter Bilder erzeugen')
if (!uxSrc.includes('Schreib zuerst einen kurzen Hinweis')) {
  fail('Klick ohne Hinweis sagt was fehlt, statt still zu bleiben')
}

const apiSrc = readFileSync(new URL('../api/[...slug].ts', import.meta.url), 'utf8')
if (!apiSrc.includes('film-storyboard-still-plan')) {
  fail('Packzettel hat eine eigene API-Route')
}
if (!apiSrc.includes('planFilmPanelStillEdit')) fail('API ruft planFilmPanelStillEdit')

const clientSrc = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
if (!clientSrc.includes('/film-storyboard-still-plan')) fail('Client ruft den Packzettel extra')
if (!clientSrc.includes('STILL_EDIT_PLAN_CLIENT_TIMEOUT_MS')) {
  fail('Client-Wartezeit deckt Planner plus einen kurzen zweiten Ask')
}
if (!clientSrc.includes('fromServer') || !clientSrc.includes('err.error')) {
  fail('Client zeigt den Server-error-Text, keinen eigenen Satz ohne Grund')
}
if (clientSrc.includes(`'${STILL_EDIT_PLANNER_ERROR_DE}'`) || clientSrc.includes(`"${STILL_EDIT_PLANNER_ERROR_DE}"`)) {
  fail('Client darf den Satz ohne Klammer nicht als Fallback hart kodieren')
}
if (clientTimeoutMessage('/film-storyboard-still-plan', 'abort') !== STILL_EDIT_PLANNER_TIMEOUT_DE) {
  fail('Client-Timeout am Packzettel sagt Zeitlimit, nicht nur den kurzen Satz')
}

const boardSrc = readFileSync(new URL('../src/story/FilmStoryboardPage.tsx', import.meta.url), 'utf8')
if (!boardSrc.includes('stills.errors[panel.id]')) {
  fail('Bilder-Seite zeigt den Fehler am Bild, nicht nur in Szenen anpassen')
}

console.log('OK: Bild ändern als Packzettel-Förderband, ohne Stichwort-Denken')
