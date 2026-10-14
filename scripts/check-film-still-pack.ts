/**
 * Bild ändern: dasselbe Vorlagenpaket wie erstes Malen + Hinweis wörtlich.
 * Kein Katalog, kein Packzettel-Tor. Keine Stichwörter.
 * Aufruf: npx tsx scripts/check-film-still-pack.ts
 */
import { readFileSync } from 'node:fs'
import type { Dialog, FilmInventory } from '../shared/types.ts'
import type { FilmPlacement, FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.ts'
import {
  catalogForPlanner,
  parseStillEditPackzettel,
  pickStillCatalogForDirectPaint,
  pickStillCatalogImages,
  resolveStillEditPaint,
  stillEditCatalog,
  stillEditDirectAttachEn,
  stillEditDirectPaintPrompt,
  stillEditFigures,
  stillEditHarvestNoteDe,
  stillEditHarvestNoteForPaint,
  stillEditImageErrorDe,
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
  tryStillEditPackzettel,
  isStillEditPlannerQuotaError,
  withStillEditPlannerQuotaRetries,
  STILL_EDIT_DIRECTOR_DE,
  STILL_EDIT_IMAGE_ERROR_DE,
  STILL_EDIT_IMAGE_TIMEOUT_DE,
  STILL_EDIT_PAINT_STATUS_DE,
  STILL_EDIT_PLAN_CLIENT_TIMEOUT_MS,
  STILL_EDIT_PLAN_STATUS_DE,
  STILL_EDIT_PLANNER_EMPTY_DE,
  STILL_EDIT_PLANNER_ERROR_DE,
  STILL_EDIT_PLANNER_GOOGLE_DE,
  STILL_EDIT_PLANNER_HTTP_BUDGET_MS,
  STILL_EDIT_PLANNER_INVALID_DE,
  STILL_EDIT_PLANNER_MODEL,
  STILL_EDIT_PLANNER_QUOTA_DE,
  STILL_EDIT_PLANNER_QUOTA_RETRIES,
  STILL_EDIT_PLANNER_TIMEOUT_DE,
  STILL_EDIT_PLANNER_TIMEOUT_MS,
  type StillCatalogItem,
} from '../shared/film-still-pack.ts'
import { clientTimeoutMessage } from '../shared/api-timeout.ts'
import { buildFilmStillPrompt, stillReferencePack } from '../shared/film-stills.ts'

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

{
  const firstPack = stillReferencePack(table, { board, inventory })
  const editPack = stillReferencePack(
    { ...table, stillCorrection: hint, directorNote: hint },
    { board, inventory },
  )
  if (editPack.urls.join('|') !== firstPack.urls.join('|')) {
    fail('Bild ändern schickt dieselben Fotos wie das erste Malen')
  }
  if (editPack.urls.includes(table.stillUrl || '')) {
    fail('aktuelles Tischbild nicht mitschicken — das hat die Gäste kopiert')
  }
  if (editPack.urls.length > 4) fail('kleines Paket wie erstes Malen, kein Filmkatalog')
  if (editPack.items.some((it) => it.name === 'aktuelles Bild')) {
    fail('kein GROUNDBILD-Lock auf dem aktuellen Still')
  }
  const editPrompt = buildFilmStillPrompt({
    caption: table.caption,
    imageCue: table.imageCue,
    settingHint: table.settingHint,
    hasLibraryRefs: true,
    stillCorrection: hint,
    directorNote: hint,
    names: table.placements.map((p) => p.name),
    spokenLine: table.caption,
  })
  if (!editPrompt.includes(hint)) fail('Hinweis wörtlich an die Bild-KI')
  if (!editPrompt.includes(STILL_EDIT_DIRECTOR_DE)) {
    fail('Regie-Satz: Hinweis ist die Regie; Fotos sind Aussehen')
  }
  if (/MUST be visible/.test(editPrompt)) {
    fail('Hinweis entscheidet wer im Bild ist')
  }
  const firstPrompt = buildFilmStillPrompt({
    caption: table.caption,
    imageCue: table.imageCue,
    settingHint: table.settingHint,
    hasLibraryRefs: true,
    names: table.placements.map((p) => p.name),
    spokenLine: table.caption,
  })
  if (!firstPrompt.includes(table.caption)) fail('Erstes Malen hat die deutsche Zeile')
  if (firstPrompt.includes(hint)) fail('Erstes Malen hat keinen Änderungshinweis')
}
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

if (STILL_EDIT_PLANNER_TIMEOUT_MS < 8_000 || STILL_EDIT_PLANNER_TIMEOUT_MS > 20_000) {
  fail('Packzettel ist ein kurzer Ask, dann malt die Bild-KI')
}
if (STILL_EDIT_PLANNER_QUOTA_RETRIES !== 0) {
  fail('Planner wartet nicht auf 429 — Bild ändern malt trotzdem')
}
if (STILL_EDIT_PLANNER_HTTP_BUDGET_MS >= 30_000) fail('Packzettel-HTTP kurz, damit Malen startet')
if (STILL_EDIT_PLAN_CLIENT_TIMEOUT_MS >= 30_000) fail('Client wartet nicht minutenlang auf den Packzettel')
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
  /tts|image|lite/i.test(STILL_EDIT_PLANNER_MODEL) ||
  STILL_EDIT_PLANNER_MODEL !== 'gemini-2.5-flash'
) {
  fail('Planner ist dasselbe Dialog-Textmodell, nicht flash-lite')
}
const sdk402 =
  '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [402 Payment Required]'
if (stillEditPlannerGoogleHttpStatus(sdk402) !== 402) fail('Google 402 Payment Required erkennen')
if (stillEditPlannerErrorDe(new Error(sdk402)).includes('http') || stillEditPlannerErrorDe(new Error(sdk402)).includes('googleapis')) {
  fail('402 ohne Google-URL in der Meldung')
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
  let n = 0
  try {
    await withStillEditPlannerQuotaRetries(
      async () => {
        n += 1
        throw new Error('429 Too Many Requests')
      },
      { sleep: async () => { fail('429 am optionalen Packzettel nicht warten') } },
    )
    fail('429 ohne Retry muss werfen')
  } catch (err) {
    if (!(err instanceof Error) || !/429/.test(err.message)) fail('429 bleibt der Fehler')
  }
  if (n !== 1) fail('Packzettel versucht 429 nicht nochmal — Bild-KI malt')
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

{
  const after402 = resolveStillEditPaint({
    packFromClient: null,
    catalog,
    userHint: hint,
    dialogDe: stillEditLineDe(table, dialog),
    figures,
    place: table.settingHint,
    styleLabel: 'lebendige Illustration',
  })
  if (after402.mode !== 'direct') fail('Planner 402/kein Packzettel → Bild-KI direkt')
  if (!after402.prompt.includes(hint)) fail('Hinweis wörtlich an die Bild-KI')
  if (!after402.prompt.includes(STILL_EDIT_DIRECTOR_DE)) fail('Regie-Satz an die Bild-KI')
  if (!after402.prompt.includes('So, das Wasser kann kochen')) fail('Deutsche Zeile an die Bild-KI')
  if (!after402.picked.some((it) => it.kind === 'current')) fail('aktuelles Still beschriftet mitschicken')
  if (!after402.picked.some((it) => it.kind === 'person')) fail('Gesicht/Kleidung mitschicken')
  if (!after402.picked.some((it) => it.kind === 'place' || /Küche|Herd/.test(it.label))) {
    fail('Ort/Herd mitschicken')
  }
  if (!after402.picked.some((it) => it.kind === 'prop')) fail('Kanne/Requisite mitschicken')
  if (!after402.attach.includes('current')) fail('aktuelles Still als current beschriften')
  if (/exact people|same seats/i.test(after402.attach)) {
    fail('Direkt-Malen hängt keine Sitzplan-Sperre an')
  }
  const harvest402 = stillEditHarvestNoteForPaint(hint, after402)
  if (harvest402.includes('Packzettel:')) fail('Ohne Packzettel nicht Packzettel auf das Bild schreiben')
  if (!harvest402.includes(hint)) fail('Ernte-Notiz nennt den Hinweis')
}

{
  const packed = resolveStillEditPaint({
    packFromClient: {
      imagePrompt: 'Ramo alone at the stove, same kettle, new blocking, no guests.',
      imageIds: ['person-ramo', 'prop-kanne-1'],
    },
    catalog,
    userHint: hint,
    dialogDe: stillEditLineDe(table, dialog),
    figures,
    place: table.settingHint,
  })
  if (packed.mode !== 'packzettel') fail('gültiger Packzettel wird benutzt')
  if (packed.prompt !== 'Ramo alone at the stove, same kettle, new blocking, no guests.') {
    fail('Packzettel-Prompt unverändert an die Bild-KI')
  }
  if (!packed.picked.some((it) => it.id === 'person-ramo')) fail('Packzettel-ids an die Bild-KI')
  if (packed.picked.some((it) => it.id === 'current-table')) {
    fail('nur gelistete Packzettel-ids, nicht von allein das Tischbild')
  }
  if (tryStillEditPackzettel({ imagePrompt: 'ok', imageIds: [] }) !== null) {
    fail('Packzettel ohne ids zählt nicht — direkt malen')
  }
  if (tryStillEditPackzettel(null) !== null) fail('kein Packzettel nach 402')
}

{
  const directPicked = pickStillCatalogForDirectPaint(catalog)
  if (!directPicked.some((it) => it.kind === 'current')) fail('Direkt-Katalog hat current')
  const attachDirect = stillEditDirectAttachEn(directPicked)
  if (!attachDirect.includes('current')) fail('Direkt-Anhang sagt current')
  const promptDirect = stillEditDirectPaintPrompt({
    userHint: hint,
    dialogDe: stillEditLineDe(table, dialog),
    figures,
    place: 'Küche',
  })
  if (promptDirect !== stillEditDirectPaintPrompt({
    userHint: hint,
    dialogDe: stillEditLineDe(table, dialog),
    figures,
    place: 'Küche',
  })) {
    fail('Direkt-Prompt ist determiniert, kein Stichwort-Zweig')
  }
  if (!promptDirect.includes(hint) || !promptDirect.includes(STILL_EDIT_DIRECTOR_DE)) {
    fail('Direkt-Prompt = Hinweis + Regie')
  }
}

if (stillEditImageErrorDe(new Error(sdk402)).includes('Packzettel')) {
  fail('Bild-Fehler sagt nicht Packzettel — 402 am Planner ist kein rotes Tor')
}
if (stillEditImageErrorDe(new Error(sdk402)) !== 'Das Bild konnte nicht neu gemalt werden (402). Bitte noch einmal «Bild ändern».') {
  fail('402 an der Bild-KI ist (402) auf Deutsch, ohne URL')
}
if (stillEditImageErrorDe(new Error(STILL_EDIT_PLANNER_ERROR_DE)) !== STILL_EDIT_IMAGE_ERROR_DE) {
  fail('Packzettel-Satz nicht als Bild-Fehler zeigen')
}
if (stillEditImageErrorDe(new Error('Zeitüberschreitung bei der KI')) !== STILL_EDIT_IMAGE_TIMEOUT_DE) {
  fail('Bild-Timeout auf Deutsch')
}
if (
  stillEditImageErrorDe(new Error(quotaRaw)) !== STILL_EDIT_PLANNER_QUOTA_DE ||
  stillEditImageErrorDe(new Error(quotaRaw)).includes('http')
) {
  fail('Bild-Quota wie Probe, ohne URL')
}
if (!STILL_EDIT_PAINT_STATUS_DE.includes('neu gemalt')) {
  fail('Status: wird neu gemalt …')
}

const stillFnSrc = readFileSync(new URL('../lib/film-storyboard.ts', import.meta.url), 'utf8')
const stillFn = stillFnSrc.slice(
  stillFnSrc.indexOf('export async function stillFilmPanel'),
  stillFnSrc.indexOf('export async function saveFilmPlan'),
)
if (stillFn.includes('planStillEditPackzettel')) {
  fail('Bild-Aufruf plant nicht — ein Bild-Call wie erstes Malen')
}
if (stillFn.includes('resolveStillEditPaint') || stillFn.includes('stillEditCatalog')) {
  fail('Bild ändern schickt nicht den Filmkatalog')
}
if (stillFn.includes('packFromClient') || stillFn.includes('packzettel')) {
  fail('Bild ändern nimmt keinen Packzettel')
}
if (!stillFn.includes('stillReferencePack')) {
  fail('Bild ändern ruft stillReferencePack wie das erste Malen')
}
if (stillFn.includes('correctFromUrlForPanel')) {
  fail('Bild ändern hängt das aktuelle Still nicht als GROUNDBILD an')
}
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
if (pngSrc.includes('opts.packzettel') || pngSrc.includes('if (opts.packzettel)')) {
  fail('Bild-KI-Aufruf hat keinen Packzettel-Pfad')
}
const genFn = pngSrc.slice(pngSrc.indexOf('export async function generateFilmPanelStillImage'))
if (!genFn.includes('stillReferencePack')) fail('Bild-KI nutzt stillReferencePack')
if (!pngSrc.includes('res.status')) fail('Standbild-Fehler enthält Google-HTTP-Status')
if (!pngSrc.includes('STILL_EDIT_IMAGE_TIMEOUT_DE')) fail('Zeitlimit kommt in der roten Box')

const aiSrc = readFileSync(new URL('../lib/ai.ts', import.meta.url), 'utf8')
if (!aiSrc.includes('planStillEditPackzettel')) fail('planStillEditPackzettel ist die optionale Drehbuch-KI')
if (!aiSrc.includes('STILL_EDIT_PLANNER_TIMEOUT_MS')) fail('Planner ist ein kurzer Text-Aufruf')
if (!aiSrc.includes('catalogForPlanner')) fail('Planner bekommt den Text-Katalog, nicht die PNGs')
if (!aiSrc.includes('GEMINI_MODEL')) fail('Planner nutzt dasselbe Modell wie Dialog')
if (!aiSrc.includes('STILL_EDIT_PLANNER_MODEL')) fail('Packzettel-Planner ist Dialog-Flash, nicht TTS')
if (aiSrc.includes('flash-lite')) fail('Kein flash-lite — 402-Magnet')
if (!aiSrc.includes('stillEditPlannerChatJsonOpts')) fail('Planner-Request an chatJson wie Dialog')
if (aiSrc.includes('SchemaType')) fail('Kein SDK-SchemaType')
if (aiSrc.includes('STILL_EDIT_PACK_SCHEMA')) fail('Kein Packzettel-responseSchema')
if (!aiSrc.includes('[still-edit-packzettel]')) fail('Roh-Ursache des Packzettels serverseitig loggen')
if (aiSrc.includes('withStillEditPlannerQuotaRetries')) {
  fail('Planner wartet nicht auf Quota — Bild ändern malt')
}
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
if (!hookSrc.includes('stillEditImageErrorDe')) {
  fail('Rot nur nach Bild-Fehler')
}
if (hookSrc.includes('filmStillPlan')) fail('Bild ändern ruft nicht den Packzettel-Planner')
if (hookSrc.includes('STILL_EDIT_PLAN_STATUS_DE')) fail('kein Status Packzettel …')
if (!hookSrc.includes('STILL_EDIT_PAINT_STATUS_DE')) fail('Status wird neu gemalt …')
if (hookSrc.includes('tryStillEditPackzettel')) fail('kein Packzettel-JSON an den Bild-Aufruf')
const genOne = hookSrc.slice(hookSrc.indexOf('const generateOne'), hookSrc.indexOf('return { busySceneId'))
if (!genOne.includes('filmStill(')) fail('Bild ändern malt in einem Aufruf')
if (genOne.includes('packzettel')) fail('Bild ändern schickt keinen Packzettel')

const uxSrc = readFileSync(new URL('../src/story/FilmSceneGenerate.tsx', import.meta.url), 'utf8')
if (!uxSrc.includes('Bild ändern')) fail('Knopf Bild ändern bleibt')
if (!uxSrc.includes('placeholder=')) fail('Kurzer Hinweis bleibt das Eingabefeld')
if (!uxSrc.includes('alert-error')) fail('Fehler neben Bild ändern zeigen, nicht nur unter Bilder erzeugen')
if (!uxSrc.includes('Schreib zuerst einen kurzen Hinweis')) {
  fail('Klick ohne Hinweis sagt was fehlt, statt still zu bleiben')
}

const apiSrc = readFileSync(new URL('../api/[...slug].ts', import.meta.url), 'utf8')
const stillRoute = apiSrc.slice(
  apiSrc.indexOf("route === 'film-storyboard-still'"),
  apiSrc.indexOf("route === 'film-panel-layout'"),
)
if (stillRoute.includes('packzettel')) fail('Bild-API nimmt keinen Packzettel')
if (!stillRoute.includes('stillFilmPanel')) fail('Bild-API ruft stillFilmPanel')

const clientSrc = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const filmStillClient = clientSrc.slice(
  clientSrc.indexOf('filmStill:'),
  clientSrc.indexOf('filmPanelLayout:'),
)
if (filmStillClient.includes('packzettel')) fail('Client schickt keinen Packzettel mit Bild ändern')
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

const planMd = readFileSync(new URL('../docs/ZEBLA_PLAN.md', import.meta.url), 'utf8')
if (!planMd.includes('erstes Paket') && !planMd.includes('stillReferencePack')) {
  fail('ZEBLA_PLAN: Bild ändern = erstes Paket + Hinweis')
}
if (!planMd.includes('Hinweis ist die Regie')) {
  fail('ZEBLA_PLAN: Hinweis ist die Regie; Fotos sind Aussehen')
}

console.log('OK: Bild ändern = erstes Paket + Hinweis, ohne Katalog')
