/**
 * Drehbuch-Inventar und Vorlagen: jede wiederkehrende Sache wandert mit Foto.
 * Aufruf: npx tsx scripts/check-film-inventory.ts
 */
import { readFileSync } from 'node:fs'
import {
  applyContinuityCues,
  deriveFilmInventory,
  inferPropIdsFromText,
  mergeLinePropIds,
} from '../shared/film-inventory.ts'
import {
  insertCameraLine,
  previousPropStillUrl,
  stillReferencePack,
} from '../shared/film-stills.ts'
import { planBoardWithoutAi } from '../shared/film-storyboard.ts'
import { inferDialogLineKind, type Dialog } from '../shared/types.ts'
import type { FilmStoryboard } from '../shared/film-storyboard.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (!inferPropIdsFromText('Ramo füllt Wasser in den Kessel').includes('kanne-1')) {
  fail('Kessel in der Küche ist kanne-1')
}
if (!inferPropIdsFromText('Ramo trägt das Tablett mit der Kanne').includes('tablett-1')) {
  fail('Tablett bleibt tablett-1')
}
if (!inferPropIdsFromText('Ramo trägt das Tablett mit der Kanne').includes('kanne-1')) {
  fail('Kanne auf dem Tablett bleibt kanne-1')
}
if (inferPropIdsFromText('Ramo sitzt im Wohnzimmer bei den Gästen').includes('kanne-1')) {
  fail('Wohnzimmer-Weit ohne Kanne ist kein Kannen-Foto')
}

if (
  inferDialogLineKind({
    speaker: 'Handlung',
    kind: 'action',
    text: 'Ramo bereitet Tee vor für seine Gäste',
  }) !== 'action'
) {
  fail('deutsche Tee-Handlung bleibt still')
}
if (
  inferDialogLineKind({
    speaker: 'Handlung',
    kind: 'action',
    text: 'Ramo füllt Wasser in den Kessel',
  }) !== 'action'
) {
  fail('Wasser in den Kessel bleibt Handlung')
}

if (!insertCameraLine('Die Tür').toLowerCase().includes('eye level')) {
  fail('Zwischenbild: Kamera auf Augenhöhe')
}
if (!insertCameraLine('Schloss').includes('1.0–1.2') && !insertCameraLine('Schloss').includes('1.0-1.2')) {
  fail('Türschloss auf 1–1,2 m, nicht am Boden')
}
if (!insertCameraLine('Tee').includes('PROP LOCK')) {
  fail('Zwischenbild sperrt die Requisite aus dem Foto')
}
if (!insertCameraLine('Blumen auf dem Tisch').includes('PROP LOCK')) {
  fail('Zwischenbild sperrt jedes Requisit aus dem Foto, nicht nur Tee')
}

const coatInv = {
  people: [],
  places: [],
  props: [{ id: 'mantel-1', nameDe: 'Mantel' }],
}
if (
  !inferPropIdsFromText('Khan hängt den Mantel an die Garderobe', coatInv).includes('mantel-1')
) {
  fail('Inventar-Name Mantel wird erkannt, ohne fest verdrahtet zu sein')
}
if (inferPropIdsFromText('Khan hängt den Mantel an die Garderobe').includes('mantel-1')) {
  fail('Mantel ist keine feste Liste, nur Inventar der Geschichte')
}
if (inferPropIdsFromText('Khan bringt Blumen an der Tür').includes('blumen-1')) {
  fail('Blumen sind keine feste Liste — ids kommen aus der Geschichte')
}

const dialog: Dialog = {
  id: 'd-inv',
  userId: 'u1',
  title: 'Tee',
  sourceLanguage: 'de',
  targetLanguage: 'fa',
  length: 'short',
  filmPrompt: 'Ramo kocht Tee in der Küche und trägt Kanne und Tablett ins Wohnzimmer.',
  sections: [
    {
      id: 's-kitchen',
      title: 'Küche',
      lines: [
        {
          id: 'k-fill',
          speaker: 'Handlung',
          kind: 'action',
          text: 'Ramo füllt Wasser in den Kessel.',
          cueImage: 'Kessel an der Spüle',
        },
        {
          id: 'k-stove',
          speaker: 'Handlung',
          kind: 'action',
          text: 'Ramo stellt den Kessel auf den Herd.',
          cueImage: 'Kessel auf den Herd',
        },
      ],
    },
    {
      id: 's-living',
      title: 'Wohnzimmer',
      lines: [
        {
          id: 'l-wide',
          speaker: 'Ramo',
          kind: 'speech',
          text: 'Salam.',
        },
        {
          id: 'l-carry',
          speaker: 'Handlung',
          kind: 'action',
          text: 'Ramo trägt die Kanne auf dem Tablett ins Wohnzimmer.',
          cueImage: 'Ramo mit Tablett und Kanne zwischen den Gästen',
        },
      ],
    },
  ],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

const idsKitchen = mergeLinePropIds(dialog.sections[0]!.lines[0]!)
const idsCarry = mergeLinePropIds(dialog.sections[1]!.lines[1]!)
if (!idsKitchen.includes('kanne-1')) fail('Küchenzeile kennt kanne-1')
if (!idsCarry.includes('kanne-1')) fail('Wohnzimmer-Zeile benutzt dieselbe kanne-1')
if (!idsCarry.includes('tablett-1')) fail('Wohnzimmer-Zeile kennt tablett-1')

const inventory = deriveFilmInventory(dialog)
if (!inventory.props.some((p) => p.id === 'kanne-1')) fail('Inventar hat kanne-1')
if (!inventory.props.some((p) => p.id === 'tablett-1')) fail('Inventar hat tablett-1')
if (!inventory.places.some((p) => p.key === 'kitchen')) fail('Inventar hat die Küche')
if (!inventory.places.some((p) => p.key === 'living')) fail('Inventar hat das Wohnzimmer')

const board = planBoardWithoutAi(dialog, [])
const kitchenPanel = board.panels.find((p) => p.lineIds.includes('k-fill'))
const stovePanel = board.panels.find((p) => p.lineIds.includes('k-stove'))
const livingWide = board.panels.find((p) => p.lineIds.includes('l-wide'))
const livingCarry = board.panels.find((p) => p.lineIds.includes('l-carry'))
if (!kitchenPanel || !stovePanel || !livingWide || !livingCarry) {
  fail('Board hat Küche, Herd, Wohnzimmer-Weit und Kanne-trägt')
}
if (!kitchenPanel.propIds?.includes('kanne-1')) fail('Küchenbild speichert kanne-1')
if (!stovePanel.propIds?.includes('kanne-1')) fail('Herd-Bild behält kanne-1')
if (!livingCarry.propIds?.includes('kanne-1')) fail('Wohnzimmer-Tragen behält kanne-1')
if (!livingCarry.propIds?.includes('tablett-1')) fail('Wohnzimmer-Tragen behält tablett-1')
if (livingWide.propIds?.includes('kanne-1')) {
  fail('Wohnzimmer-Weit ohne Kanne bekommt keine kanne-1')
}

const painted: FilmStoryboard = {
  ...board,
  panels: board.panels.map((p) => {
    if (p.id === kitchenPanel.id) {
      return {
        ...p,
        stillUrl: 'https://example.com/kitchen-kettle.png',
        shot: 'insert' as const,
      }
    }
    if (p.id === stovePanel.id) {
      return {
        ...p,
        stillUrl: 'https://example.com/kitchen-stove.png',
        shot: 'insert' as const,
      }
    }
    if (p.id === livingWide.id) {
      return {
        ...p,
        stillUrl: 'https://example.com/living-wide.png',
        shot: 'wide' as const,
        caption: 'Salam, die Gäste sitzen im Wohnzimmer',
        imageCue: 'Gäste am Boden',
        propIds: [],
        refNeeds: { people: ['Ramo'], places: ['living'], propIds: [] },
      }
    }
    if (p.id === livingCarry.id) {
      return {
        ...p,
        stillUrl: undefined,
        shot: 'insert' as const,
        caption: 'Ramo trägt die Kanne auf dem Tablett ins Wohnzimmer',
        imageCue: 'SAME kettle/tray as earlier',
        placements: [
          {
            ...p.placements[0]!,
            name: 'Ramo',
            imageUrl: 'https://example.com/ramo.png',
          },
        ],
        background: {
          hint: 'Wohnzimmer',
          imageUrl: 'https://example.com/living-empty.png',
          match: 'reuse' as const,
          matchNoteDe: '',
        },
      }
    }
    return p
  }),
}

const carry = painted.panels.find((p) => p.lineIds.includes('l-carry'))!
if (previousPropStillUrl(painted, carry, 'kanne-1') !== 'https://example.com/kitchen-stove.png') {
  fail('Kanne im Wohnzimmer nimmt das letzte Küchenbild mit Kanne, nicht das Wohnzimmer-Weit')
}
if (previousPropStillUrl(painted, kitchenPanel, 'kanne-1')) {
  fail('Erstes Kannen-Bild hat noch kein voriges Kannen-Foto')
}

const packCarry = stillReferencePack(carry, { board: painted })
if (!packCarry.urls.includes('https://example.com/kitchen-stove.png')) {
  fail('Wohnzimmer-Bild mit Kanne bekommt das Küchen-Foto der Kanne')
}
const kettleItem = packCarry.items.find((it) => it.url === 'https://example.com/kitchen-stove.png')
if (kettleItem?.role !== 'prop') fail('Küchenbild ist das Requisiten-Foto, nicht bloss ein Raum')
if (!packCarry.instruction.includes('PROP: the SAME kettle')) {
  fail('Anweisung sagt: SAME kettle as in this photo')
}
if (packCarry.items.find((it) => it.url === 'https://example.com/living-wide.png')?.role === 'prop') {
  fail('Wohnzimmer-Weit ist nicht das Kannen-Foto')
}
if (packCarry.urls[0] === 'https://example.com/living-wide.png') {
  fail('Kannen-Foto hat Vorrang vor einem beliebigen Wohnzimmer-Weit')
}
if (packCarry.urls.length > 4) fail('Höchstens 4 Vorlagen')

const stoveNow = painted.panels.find((p) => p.lineIds.includes('k-stove'))!
const packFirstStove = stillReferencePack(stoveNow, { board: painted, inventory })
const packCorrect = stillReferencePack(
  { ...stoveNow, stillCorrection: 'Kessel näher', directorNote: 'Kessel näher' },
  { board: painted, inventory },
)
if (packCorrect.items.some((it) => it.name.startsWith('vorige'))) {
  fail('Bild ändern hängt vorige Szenen-Bilder nicht als Komposition an')
}
if (packCorrect.urls.includes('https://example.com/kitchen-kettle.png')) {
  fail('Bild ändern hängt kein Szenen-Still als Requisite an')
}
if (!packFirstStove.urls.includes('https://example.com/kitchen-kettle.png')) {
  fail('Erstes Malen schickt die vorige Kanne mit')
}
if (packCorrect.items.some((it) => it.name === 'aktuelles Bild')) {
  fail('aktuelles Still nicht als GROUNDBILD mitschicken')
}

const firstKitchen = painted.panels.find((p) => p.lineIds.includes('k-fill'))!
const packFirst = stillReferencePack(firstKitchen, { board: painted })
if (packFirst.items.some((it) => it.role === 'prop')) {
  fail('Erstes Kannen-Bild hängt kein voriges Kannen-Foto an')
}

const flowersDialog: Dialog = {
  id: 'd-flowers',
  userId: 'u1',
  title: 'Blumen',
  sourceLanguage: 'de',
  targetLanguage: 'fa',
  length: 'short',
  filmPrompt: 'Khan bringt Blumen mit. Später stehen sie auf dem Wohnzimmertisch.',
  filmInventory: {
    people: [{ name: 'Khan' }],
    places: [
      { key: 'door', labelDe: 'Tür' },
      { key: 'living', labelDe: 'Wohnzimmer' },
    ],
    props: [{ id: 'blumen-1', nameDe: 'Blumen', firstSeenLineHint: 'Khan bringt Blumen' }],
  },
  sections: [
    {
      id: 's-door',
      title: 'Tür',
      lines: [
        {
          id: 'f-gift',
          speaker: 'Handlung',
          kind: 'action',
          text: 'Khan bringt Blumen an der Tür.',
          cueImage: 'Khan mit Blumenstrauß an der Wohnungstür',
          propIds: ['blumen-1'],
        },
      ],
    },
    {
      id: 's-living-flowers',
      title: 'Wohnzimmer',
      lines: [
        {
          id: 'f-wide',
          speaker: 'Khan',
          kind: 'speech',
          text: 'Salam.',
        },
        {
          id: 'f-table',
          speaker: 'Handlung',
          kind: 'action',
          text: 'Die Blumen stehen auf dem Wohnzimmertisch.',
          cueImage: 'Strauß auf dem niedrigen Tisch',
        },
      ],
    },
  ],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

if (
  !inferPropIdsFromText(
    'Die Blumen stehen auf dem Wohnzimmertisch',
    flowersDialog.filmInventory,
  ).includes('blumen-1')
) {
  fail('Spätere Zeile erkennt blumen-1 aus dem Inventar, ohne die id in der Zeile')
}

const flowersInventory = deriveFilmInventory(flowersDialog)
if (!flowersInventory.props.some((p) => p.id === 'blumen-1' && p.nameDe === 'Blumen')) {
  fail('Inventar hat offene Requisite blumen-1 / Blumen')
}

const flowersCued = applyContinuityCues(flowersDialog.sections, flowersInventory)
const tableCue = flowersCued[1]?.lines.find((l) => l.id === 'f-table')?.cueImage || ''
if (!/same flowers as earlier/i.test(tableCue)) {
  fail('Spätere Blumen-Zeile bekommt SAME flowers as earlier')
}

const flowersBoard = planBoardWithoutAi(flowersDialog, [])
const giftPanel = flowersBoard.panels.find((p) => p.lineIds.includes('f-gift'))
const livingFlowersWide = flowersBoard.panels.find((p) => p.lineIds.includes('f-wide'))
const tablePanel = flowersBoard.panels.find((p) => p.lineIds.includes('f-table'))
if (!giftPanel || !livingFlowersWide || !tablePanel) {
  fail('Board hat Tür-Geschenk, Wohnzimmer-Weit und Tisch mit Blumen')
}
if (!giftPanel.propIds?.includes('blumen-1')) fail('Tür-Bild speichert blumen-1')
if (!tablePanel.propIds?.includes('blumen-1')) {
  fail('Tisch-Bild behält dieselbe blumen-1, obwohl die Zeile die id nicht wiederholt')
}
if (livingFlowersWide.propIds?.includes('blumen-1')) {
  fail('Wohnzimmer-Weit ohne Blumen bekommt keine blumen-1')
}

const flowersPainted: FilmStoryboard = {
  ...flowersBoard,
  panels: flowersBoard.panels.map((p) => {
    if (p.id === giftPanel.id) {
      return {
        ...p,
        stillUrl: 'https://example.com/door-flowers.png',
        shot: 'insert' as const,
      }
    }
    if (p.id === livingFlowersWide.id) {
      return {
        ...p,
        stillUrl: 'https://example.com/living-salam.png',
        shot: 'wide' as const,
        propIds: [],
        refNeeds: { people: ['Khan'], places: ['living'], propIds: [] },
      }
    }
    if (p.id === tablePanel.id) {
      return {
        ...p,
        stillUrl: undefined,
        shot: 'insert' as const,
        caption: 'Die Blumen stehen auf dem Wohnzimmertisch',
        imageCue: 'SAME flowers as earlier',
      }
    }
    return p
  }),
}

const tableNow = flowersPainted.panels.find((p) => p.lineIds.includes('f-table'))!
if (previousPropStillUrl(flowersPainted, tableNow, 'blumen-1') !== 'https://example.com/door-flowers.png') {
  fail('Blumen auf dem Tisch nehmen das Tür-Foto, nicht das Wohnzimmer-Weit')
}

const packFlowers = stillReferencePack(tableNow, {
  board: flowersPainted,
  inventory: flowersInventory,
})
if (!packFlowers.urls.includes('https://example.com/door-flowers.png')) {
  fail('Wohnzimmer-Tisch bekommt das Foto derselben Blumen')
}
const flowerItem = packFlowers.items.find((it) => it.url === 'https://example.com/door-flowers.png')
if (flowerItem?.role !== 'prop') fail('Tür-Bild ist das Blumen-Foto, nicht bloss ein Raum')
if (!packFlowers.instruction.includes('PROP: the SAME flowers')) {
  fail('Anweisung sagt: SAME flowers as in this photo')
}
if (packFlowers.instruction.includes('SAME kettle/tray as earlier')) {
  fail('Blumen-Anweisung klingt nicht nach nur-Tee')
}

const aiSrc = readFileSync(new URL('../lib/ai.ts', import.meta.url), 'utf8')
if (!aiSrc.includes('filmInventory')) fail('Drehbuch-KI liefert Inventar')
if (!aiSrc.includes('Wenn Khan Blumen mitbringt')) {
  fail('Prompt sagt der KI, wiederkehrende Sachen zu suchen (Blumen-Beispiel)')
}
if (!aiSrc.includes('Gleiche Regel für jedes Requisit')) {
  fail('Prompt gilt für jedes Requisit, nicht nur Tee')
}
if (!aiSrc.includes('SAME flowers as earlier')) fail('Prompt verlangt SAME flowers as earlier')
if (!aiSrc.includes('SAME kettle/tray as earlier')) {
  fail('Tee bleibt ein Beispiel derselben Regel')
}
if (!aiSrc.includes('planFilmPanelRefNeeds')) fail('Zweite KI prüft Vorlagen, malt nicht')
if (!aiSrc.includes('Niemals deutsche Handlungsnotizen')) {
  fail('Tee-Zubereitung bleibt stille Handlung')
}

const stillSrc = readFileSync(new URL('../shared/film-stills.ts', import.meta.url), 'utf8')
if (!stillSrc.includes('previousPropStillUrl')) fail('Vorlagen suchen das letzte Requisiten-Foto')
if (!stillSrc.includes('standing adult at eye level')) fail('Kamera auf Augenhöhe eines Stehenden')
if (!stillSrc.includes('flowers stay those flowers')) {
  fail('Bild-Sperre gilt für jedes Requisit, nicht nur Kanne')
}

console.log('OK: Inventar jeder wiederkehrenden Sache, Vorlagen mit Foto')
