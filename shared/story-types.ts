/** Asset-Bibliothek und Szenen-Typen für ZeboStories */

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
