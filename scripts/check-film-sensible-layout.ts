/**
 * Aufruf: npx tsx scripts/check-film-sensible-layout.ts
 */
import {
  applyAiLayout,
  heuristicSensibleLayout,
  isSittingPose,
  parseSensibleLayout,
} from '../shared/film-sensible-layout.ts'
import type { FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.ts'

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

if (!isSittingPose('sitting', 'sitzt')) fail('Sitzen erkennen')
if (isSittingPose('walking', 'gehen')) fail('Gehen ist nicht sitzen')

const panel: FilmStoryboardPanel = {
  id: 'p1',
  sceneId: 'scene-1',
  sceneIndex: 0,
  panelIndex: 1,
  sectionId: 'scene-1',
  lineIds: ['l1'],
  caption: 'Wohnzimmer, Sofa und Sessel',
  imageCue: 'Julien sitzt, Tara steht',
  soundCue: '',
  speechCue: '',
  settingHint: 'Wohnzimmer Sofa Sessel',
  placements: [
    {
      name: 'Julien',
      poseId: 'sitting',
      poseHint: 'Sitzen',
      depth: 'mid',
      x: 20,
      scale: 1,
      flip: false,
      match: 'reuse',
      matchNoteDe: 'ok',
      imageUrl: 'https://example.com/j.png',
    },
    {
      name: 'Tara',
      poseId: 'standing-front',
      poseHint: 'Stehen',
      depth: 'foreground',
      x: 21,
      scale: 1,
      flip: false,
      match: 'reuse',
      matchNoteDe: 'ok',
      imageUrl: 'https://example.com/t.png',
    },
  ],
  background: {
    hint: 'Wohnzimmer',
    imageUrl: 'https://example.com/room.png',
    match: 'reuse',
    matchNoteDe: 'ok',
  },
}

const laid = heuristicSensibleLayout(panel)
const julien = laid.find((u) => u.name === 'Julien')
const tara = laid.find((u) => u.name === 'Tara')
if (!julien || !tara) fail('Beide Figuren brauchen eine Lage')
if (Math.abs(julien.x - tara.x) < 8) fail('Nicht übereinander legen')
if (julien.scale >= tara.scale) fail('Sitzende Figur kleiner als stehende vorn')
if (julien.y > 90) fail('Sitzen: Füße nicht am unteren Bildrand wie Stehen')

const parsed = parseSensibleLayout(
  {
    placements: [
      { name: 'Julien', poseId: 'sitting', x: 30, y: 84, scale: 0.7, flip: false },
      { name: 'Unbekannt', x: 10, y: 10, scale: 1 },
    ],
  },
  panel,
)
if (!parsed || parsed.length !== 1) fail('Unbekannte Namen ignorieren')
if (parsed[0]?.name !== 'Julien') fail('Julien aus KI-JSON')

const board: FilmStoryboard = {
  version: 1,
  source: 'rules',
  scenes: [{ id: 'scene-1', title: 'Szene 1', noteDe: '' }],
  panels: [panel],
  updatedAt: 't',
}
const next = applyAiLayout(board, 'p1', laid)
const placed = next.panels[0]?.placements.find((p) => p.name === 'Julien')
if (placed?.layoutByAi !== true) fail('KI-Lage merken')
if (placed?.layoutLocked) fail('KI-Lage ist nicht manuell gesperrt')
if (placed?.scale === 1) fail('KI/Heuristik muss scale setzen')

console.log('OK film-sensible-layout')
