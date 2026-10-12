/**
 * Drehbuch-Inventar und Vorlagen: Kanne/Tablett wandern mit Foto.
 * Aufruf: npx tsx scripts/check-film-inventory.ts
 */
import { readFileSync } from 'node:fs'
import {
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

const firstKitchen = painted.panels.find((p) => p.lineIds.includes('k-fill'))!
const packFirst = stillReferencePack(firstKitchen, { board: painted })
if (packFirst.items.some((it) => it.role === 'prop')) {
  fail('Erstes Kannen-Bild hängt kein voriges Kannen-Foto an')
}

const aiSrc = readFileSync(new URL('../lib/ai.ts', import.meta.url), 'utf8')
if (!aiSrc.includes('filmInventory')) fail('Drehbuch-KI liefert Inventar')
if (!aiSrc.includes('kanne-1')) fail('Prompt verlangt stabile Requisiten-ids')
if (!aiSrc.includes('SAME kettle/tray as earlier')) fail('Prompt verlangt Kontinuitätssatz')
if (!aiSrc.includes('planFilmPanelRefNeeds')) fail('Zweite KI prüft Vorlagen, malt nicht')
if (!aiSrc.includes('Niemals deutsche Handlungsnotizen')) {
  fail('Tee-Zubereitung bleibt stille Handlung')
}

const stillSrc = readFileSync(new URL('../shared/film-stills.ts', import.meta.url), 'utf8')
if (!stillSrc.includes('previousPropStillUrl')) fail('Vorlagen suchen das letzte Requisiten-Foto')
if (!stillSrc.includes('standing adult at eye level')) fail('Kamera auf Augenhöhe eines Stehenden')

console.log('OK: Inventar, gleiche Kanne, Vorlagen mit Foto')
