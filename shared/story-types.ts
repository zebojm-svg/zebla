/** Asset-Bibliothek und Szenen-Typen für ZeboStories */

export type StoryAssetType = 'character' | 'environment' | 'scene' | 'prop'

/** Persistiertes KI-Asset in der persönlichen Story-Bibliothek */
export interface StoryLibraryAsset {
  id: string
  type: StoryAssetType
  name: string
  description?: string
  imageUrl: string
  tags: string[]
  /** Bildstil bei KI-Generierung */
  styleId?: string
  /** Bein-Pose bei modularen Figuren */
  legPoseId?: string
  /** Kopf-Richtung bei modularen Figuren */
  headAngleId?: string
  createdAt: string
}

/**
 * Einzelnes Requisit (Sofa, Tisch, Teppich …) — Ziel-Architektur.
 * Umgebungen werden aus Props zusammengesetzt, jedes Teil einzeln tausch-/färbbar.
 */
export interface PropAsset extends AssetMeta {
  type: 'prop'
  src: string
  category: 'moebel' | 'deko' | 'boden' | 'wand' | 'beleuchtung' | 'sonstiges'
  /** Standard-Platzierung relativ zur Szene (0–100 %) */
  defaultPosition?: { x: number; y: number }
  defaultSize?: { w: number; h: number }
  /** Varianten desselben Typs (z.B. anderes Sofa) */
  variantGroup?: string
}

/** Zusammengesetztes Umfeld aus einzelnen Prop-Layern */
export interface EnvironmentComposition {
  id: string
  name: string
  tags: string[]
  /** Optionaler KI-Hintergrund (flach) — wird durch Props ergänzt oder ersetzt */
  backgroundUrl?: string
  props: Array<{
    propId: string
    src: string
    position: { x: number; y: number }
    size: { w: number; h: number }
    zIndex: number
    hueRotate?: number
    visible?: boolean
  }>
}

export interface AssetMeta {
  id: string
  name: string
  type: 'character' | 'environment' | 'prop' | 'effect'
  tags: string[]
  style: string
  createdAt: string
}

export interface CharacterLayer {
  id: string
  /** Relativer Pfad zum PNG (transparent, freigestellt) */
  src: string
  /** Ankerposition innerhalb des Layers (0-1 normalisiert) */
  anchor: { x: number; y: number }
  /** Natürliche Größe in Pixel */
  size: { w: number; h: number }
}

export interface CharacterPose {
  id: string
  name: string
  body: string
  head: string
  arms: string
  legs?: string
}

export interface CharacterAsset extends AssetMeta {
  type: 'character'
  layers: {
    body: CharacterLayer[]
    head: CharacterLayer[]
    arms: CharacterLayer[]
    legs: CharacterLayer[]
  }
  poses: CharacterPose[]
  animations: AnimationDef[]
}

export interface EnvironmentZone {
  id: string
  position: { x: number; y: number }
  scale: number
  defaultPose?: string
}

export interface EnvironmentAsset extends AssetMeta {
  type: 'environment'
  background: string
  foreground?: string
  zones: EnvironmentZone[]
  masks?: Array<{ id: string; src: string }>
  lighting: { direction: 'left' | 'right' | 'top'; warmth: 'warm' | 'neutral' | 'cool' }
}

export interface AnimationFrame {
  layerId: string
  duration: number
}

export interface AnimationDef {
  id: string
  name: string
  fps: number
  loop: boolean
  /** Zufälliges Intervall zwischen Loops in ms */
  interval?: [number, number]
  frames: AnimationFrame[]
}

export interface SceneCharacterPlacement {
  characterId: string
  /** Anzeigename in der Szene (Sprecher im Dialog) */
  displayName?: string
  poseId: string
  expression?: string
  position: { x: number; y: number }
  scale?: number
  flip?: boolean
  animations?: string[]
}

export interface SceneAction {
  at: number
  type: 'dialog' | 'animate' | 'pose-change' | 'effect' | 'wait'
  target?: string
  speaker?: string
  text?: string
  expression?: string
  animation?: string
  to?: { x: number; y: number }
  duration?: number
  effectType?: string
}

export interface Scene {
  id: string
  environmentId: string
  characters: SceneCharacterPlacement[]
  timeline: SceneAction[]
}

export interface Story {
  id: string
  title: string
  style: string
  scenes: Scene[]
  createdAt: string
  updatedAt: string
}
