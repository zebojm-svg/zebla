/**
 * Aufruf: npx tsx scripts/check-film-still-arrange.ts
 */
import {
  applyPanelLayout,
  arrangeLayersFromPanel,
  movePlacementByPixels,
  panelCanArrange,
  scalePlacement,
} from '../shared/film-still-arrange.ts'
import type { FilmStoryboard, FilmStoryboardPanel } from '../shared/film-storyboard.ts'

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

const panel: FilmStoryboardPanel = {
  id: 'p1',
  sceneId: 'scene-1',
  sceneIndex: 0,
  panelIndex: 1,
  sectionId: 'scene-1',
  lineIds: ['l1'],
  caption: 'Mall',
  imageCue: '',
  soundCue: '',
  speechCue: '',
  settingHint: 'Einkaufszentrum',
  placements: [
    {
      name: 'Julien',
      poseId: 'walking',
      poseHint: 'Gehen',
      depth: 'foreground',
      x: 30,
      y: 90,
      scale: 1,
      flip: false,
      imageUrl: 'https://example.com/julien.png',
      match: 'reuse',
      matchNoteDe: 'ok',
    },
    {
      name: 'Tara',
      poseId: 'walking',
      poseHint: 'Gehen',
      depth: 'foreground',
      x: 55,
      y: 90,
      scale: 1,
      flip: false,
      imageUrl: 'https://example.com/tara.png',
      match: 'reuse',
      matchNoteDe: 'ok',
    },
  ],
  background: {
    hint: 'Einkaufszentrum',
    imageUrl: 'https://example.com/mall.png',
    match: 'reuse',
    matchNoteDe: 'ok',
  },
}

if (!panelCanArrange(panel)) fail('Mit Figur+Ort muss Stellen gehen')
const noBg = { ...panel, background: { ...panel.background, imageUrl: undefined } }
if (panelCanArrange(noBg)) fail('Ohne Hintergrund kein Stellen')

const layers = arrangeLayersFromPanel(panel)
if (layers[0]?.id !== 'bg') fail('Hintergrund zuerst')
if (layers.filter((l) => l.id.startsWith('fig-')).length !== 2) fail('Zwei Figuren-Lagen')

const moved = movePlacementByPixels(panel.placements[0]!, 96, 0)
if (moved.x <= 30) fail('Nach rechts schieben muss x erhöhen')
if (!moved.layoutLocked) fail('Manuelles Stellen merken')

const smaller = scalePlacement(panel.placements[0]!, 0.5)
if (smaller.scale >= 1) fail('Verkleinern muss scale senken')

const board: FilmStoryboard = {
  version: 1,
  source: 'rules',
  scenes: [{ id: 'scene-1', title: 'Szene 1', noteDe: '' }],
  panels: [panel],
  updatedAt: 't',
}
const next = applyPanelLayout(board, 'p1', [
  { name: 'Julien', poseId: 'walking', x: 72, y: 80, scale: 0.45 },
])
const julien = next.panels[0]?.placements.find((p) => p.name === 'Julien')
if (julien?.x !== 72 || julien.scale !== 0.45) fail('Lage speichern')
if (julien?.layoutLocked !== true) fail('layoutLocked nach Stellen')

console.log('check-film-still-arrange ok')
