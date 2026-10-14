/**
 * Bild ändern: Dumb conveyor — Katalog, Hinweis, Packzettel. Keine Stichwörter.
 * Aufruf: npx tsx scripts/check-film-still-pack.ts
 */
import { readFileSync } from 'node:fs'
import type { Dialog, FilmInventory } from '../shared/types.ts'
import type { FilmPlacement, FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.ts'
import {
  parseStillEditPackzettel,
  pickStillCatalogImages,
  stillEditCatalog,
  stillEditFigures,
  stillEditHarvestNoteDe,
  stillEditLineDe,
  stillEditPlannerMessages,
  stillEditPlannerSystem,
  stillNumberInScene,
  stillPackzettelAttachEn,
  stillEditTimeoutHintDe,
  STILL_EDIT_PLANNER_ERROR_DE,
  type StillCatalogItem,
} from '../shared/film-still-pack.ts'

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
  if (!(err instanceof Error) || err.message !== STILL_EDIT_PLANNER_ERROR_DE) {
    fail('Planner-Fehler auf Deutsch, denselben Satz')
  }
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
if (timeoutHint.includes('Diese Szene erzeugen')) {
  fail('Bild-ändern-Timeout darf nicht auf Diese Szene erzeugen zeigen')
}
const packHint = stillEditTimeoutHintDe(STILL_EDIT_PLANNER_ERROR_DE)
if (packHint !== STILL_EDIT_PLANNER_ERROR_DE) {
  fail('Packzettel-Fehler bleibt der gleiche Satz')
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

const boardSrc = readFileSync(new URL('../src/story/FilmStoryboardPage.tsx', import.meta.url), 'utf8')
if (!boardSrc.includes('stills.errors[panel.id]')) {
  fail('Bilder-Seite zeigt den Fehler am Bild, nicht nur in Szenen anpassen')
}

console.log('OK: Bild ändern als Packzettel-Förderband, ohne Stichwort-Denken')
