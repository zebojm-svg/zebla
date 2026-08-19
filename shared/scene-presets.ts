/** Vorgefertigte Szenen-Layouts (Requisiten als Layer auf dem Umfeld) */

export interface ScenePresetLayer {
  id: string
  name: string
  src: string
  /** Position in Prozent der Canvas-Breite/Höhe */
  position: { x: number; y: number }
  /** Größe in Pixel (1280×720 Referenz) */
  size: { w: number; h: number }
  zIndex: number
}

export interface ScenePreset {
  id: string
  name: string
  description: string
  tags: string[]
  /** Empfohlene Tags für passende Umgebungen */
  environmentTags: string[]
  layers: ScenePresetLayer[]
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'wohnzimmer-abendessen',
    name: 'Wohnzimmer · Abendessen',
    description: 'Esstisch mit Stühlen, Tellern und Gläsern — ideal für Familienszenen.',
    tags: ['wohnzimmer', 'abendessen', 'tisch', 'familie'],
    environmentTags: ['wohnzimmer', 'drinnen'],
    layers: [
      {
        id: 'table',
        name: 'Esstisch',
        src: '/assets/props/dining-table.svg',
        position: { x: 50, y: 68 },
        size: { w: 420, h: 180 },
        zIndex: 15,
      },
      {
        id: 'chair-left',
        name: 'Stuhl links',
        src: '/assets/props/chair.svg',
        position: { x: 32, y: 72 },
        size: { w: 110, h: 140 },
        zIndex: 14,
      },
      {
        id: 'chair-right',
        name: 'Stuhl rechts',
        src: '/assets/props/chair.svg',
        position: { x: 68, y: 72 },
        size: { w: 110, h: 140 },
        zIndex: 14,
      },
      {
        id: 'chair-back-left',
        name: 'Stuhl hinten links',
        src: '/assets/props/chair.svg',
        position: { x: 38, y: 58 },
        size: { w: 95, h: 120 },
        zIndex: 13,
      },
      {
        id: 'chair-back-right',
        name: 'Stuhl hinten rechts',
        src: '/assets/props/chair.svg',
        position: { x: 62, y: 58 },
        size: { w: 95, h: 120 },
        zIndex: 13,
      },
      {
        id: 'plate-left',
        name: 'Teller links',
        src: '/assets/props/plate.svg',
        position: { x: 42, y: 62 },
        size: { w: 70, h: 70 },
        zIndex: 16,
      },
      {
        id: 'plate-right',
        name: 'Teller rechts',
        src: '/assets/props/plate.svg',
        position: { x: 58, y: 62 },
        size: { w: 70, h: 70 },
        zIndex: 16,
      },
      {
        id: 'glass-left',
        name: 'Glas links',
        src: '/assets/props/glass.svg',
        position: { x: 46, y: 55 },
        size: { w: 40, h: 55 },
        zIndex: 17,
      },
      {
        id: 'glass-right',
        name: 'Glas rechts',
        src: '/assets/props/glass.svg',
        position: { x: 54, y: 55 },
        size: { w: 40, h: 55 },
        zIndex: 17,
      },
    ],
  },
  {
    id: 'wohnzimmer-fernsehen',
    name: 'Wohnzimmer · Fernsehen',
    description: 'Sofa und Couchtisch — gemütlicher Abend.',
    tags: ['wohnzimmer', 'sofa', 'abend'],
    environmentTags: ['wohnzimmer', 'drinnen'],
    layers: [
      {
        id: 'coffee-table',
        name: 'Couchtisch',
        src: '/assets/props/coffee-table.svg',
        position: { x: 50, y: 78 },
        size: { w: 280, h: 100 },
        zIndex: 15,
      },
      {
        id: 'sofa',
        name: 'Sofa',
        src: '/assets/props/sofa.svg',
        position: { x: 50, y: 62 },
        size: { w: 480, h: 200 },
        zIndex: 14,
      },
    ],
  },
  {
    id: 'park-bank',
    name: 'Park · Bank',
    description: 'Parkbank zum Sitzen und Plaudern.',
    tags: ['park', 'draussen', 'bank'],
    environmentTags: ['park', 'draussen'],
    layers: [
      {
        id: 'bench',
        name: 'Parkbank',
        src: '/assets/props/bench.svg',
        position: { x: 50, y: 74 },
        size: { w: 360, h: 130 },
        zIndex: 15,
      },
    ],
  },
]
