import { useEffect, useMemo, useState } from 'react'
import { CompositeCanvas, type LayerImage } from './CompositeCanvas'
import type { CharacterAsset, EnvironmentAsset, Scene } from '../../shared/story-types'

const CANVAS_W = 1280
const CANVAS_H = 720

// Demo-Assets (statisch eingebaut für Prototyp)
const demoEnvironment: EnvironmentAsset = {
  id: 'park',
  name: 'Park',
  type: 'environment',
  tags: ['draussen', 'natur', 'grün'],
  style: 'comic',
  createdAt: '2026-08-19',
  background: '/assets/environments/park/background.svg',
  zones: [
    { id: 'bench-left', position: { x: 25, y: 72 }, scale: 0.9 },
    { id: 'bench-right', position: { x: 65, y: 72 }, scale: 0.9 },
    { id: 'standing-center', position: { x: 50, y: 75 }, scale: 1 },
  ],
  lighting: { direction: 'left', warmth: 'warm' },
}

const demoCharacter: CharacterAsset = {
  id: 'thomas',
  name: 'Thomas',
  type: 'character',
  tags: ['mann', 'jung', 'braune-haare'],
  style: 'comic',
  createdAt: '2026-08-19',
  layers: {
    body: [{ id: 'body-front', src: '/assets/characters/thomas/body/front.svg', anchor: { x: 0.5, y: 0.9 }, size: { w: 200, h: 400 } }],
    head: [
      { id: 'head-neutral', src: '/assets/characters/thomas/head/neutral.svg', anchor: { x: 0.5, y: 0.9 }, size: { w: 120, h: 140 } },
      { id: 'head-happy', src: '/assets/characters/thomas/head/happy.svg', anchor: { x: 0.5, y: 0.9 }, size: { w: 120, h: 140 } },
    ],
    arms: [
      { id: 'arms-resting', src: '/assets/characters/thomas/arms/resting.svg', anchor: { x: 0.5, y: 0.2 }, size: { w: 220, h: 200 } },
      { id: 'arms-waving', src: '/assets/characters/thomas/arms/waving.svg', anchor: { x: 0.5, y: 0.2 }, size: { w: 220, h: 200 } },
    ],
    legs: [],
  },
  poses: [
    { id: 'standing', name: 'Stehen', body: 'body-front', head: 'head-neutral', arms: 'arms-resting' },
    { id: 'waving', name: 'Winken', body: 'body-front', head: 'head-happy', arms: 'arms-waving' },
  ],
  animations: [
    {
      id: 'blink',
      name: 'Blinzeln',
      fps: 12,
      loop: true,
      interval: [2000, 5000],
      frames: [
        { layerId: 'head-neutral', duration: 100 },
        { layerId: 'head-neutral', duration: 50 },
      ],
    },
  ],
}

const demoScene: Scene = {
  id: 'scene-1',
  environmentId: 'park',
  characters: [
    {
      characterId: 'thomas',
      poseId: 'standing',
      position: { x: 35, y: 75 },
      scale: 0.7,
      animations: ['blink'],
    },
    {
      characterId: 'thomas',
      poseId: 'waving',
      position: { x: 65, y: 75 },
      scale: 0.7,
      flip: true,
      animations: [],
    },
  ],
  timeline: [
    { at: 0, type: 'dialog', speaker: 'Thomas', text: 'Hey, schöner Tag heute!' },
    { at: 3, type: 'pose-change', target: 'thomas-0', expression: 'happy' },
    { at: 4, type: 'dialog', speaker: 'Kevin', text: 'Ja total! Lass uns was unternehmen.' },
  ],
}

function buildCharacterLayers(
  character: CharacterAsset,
  placement: Scene['characters'][0],
  index: number,
): LayerImage[] {
  const pose = character.poses.find((p) => p.id === placement.poseId) ?? character.poses[0]
  if (!pose) return []

  const scale = placement.scale ?? 1
  const baseX = (placement.position.x / 100) * CANVAS_W
  const baseY = (placement.position.y / 100) * CANVAS_H

  const findLayer = (layers: typeof character.layers.body, id: string) =>
    layers.find((l) => l.id === id) ?? layers[0]

  const bodyLayer = findLayer(character.layers.body, pose.body)
  const headLayer = findLayer(character.layers.head, pose.head)
  const armsLayer = findLayer(character.layers.arms, pose.arms)

  const result: LayerImage[] = []

  if (bodyLayer) {
    const w = bodyLayer.size.w * scale
    const h = bodyLayer.size.h * scale
    result.push({
      id: `char-${index}-body`,
      src: bodyLayer.src,
      x: baseX - w * bodyLayer.anchor.x,
      y: baseY - h * bodyLayer.anchor.y,
      width: w,
      height: h,
      flip: placement.flip,
      zIndex: 10 + index,
    })
  }

  if (armsLayer) {
    const w = armsLayer.size.w * scale
    const h = armsLayer.size.h * scale
    result.push({
      id: `char-${index}-arms`,
      src: armsLayer.src,
      x: baseX - w * armsLayer.anchor.x,
      y: baseY - h * 0.55,
      width: w,
      height: h,
      flip: placement.flip,
      zIndex: 11 + index,
    })
  }

  if (headLayer) {
    const w = headLayer.size.w * scale
    const h = headLayer.size.h * scale
    result.push({
      id: `char-${index}-head`,
      src: headLayer.src,
      x: baseX - w * headLayer.anchor.x,
      y: baseY - (bodyLayer?.size.h ?? 400) * scale * 0.85,
      width: w,
      height: h,
      flip: placement.flip,
      zIndex: 12 + index,
    })
  }

  return result
}

export function StoryPlayerPage() {
  const [currentAction, setCurrentAction] = useState(0)
  const [dialogText, setDialogText] = useState('')
  const [dialogSpeaker, setDialogSpeaker] = useState('')

  const scene = demoScene
  const env = demoEnvironment
  const char = demoCharacter

  useEffect(() => {
    if (scene.timeline.length === 0) return
    const action = scene.timeline[currentAction]
    if (!action) return
    if (action.type === 'dialog') {
      setDialogSpeaker(action.speaker ?? '')
      setDialogText(action.text ?? '')
    }
  }, [currentAction])

  const layers = useMemo<LayerImage[]>(() => {
    const result: LayerImage[] = []

    // Hintergrund
    result.push({
      id: 'bg',
      src: env.background,
      x: 0,
      y: 0,
      width: CANVAS_W,
      height: CANVAS_H,
      zIndex: 0,
    })

    // Figuren
    for (let i = 0; i < scene.characters.length; i++) {
      const placement = scene.characters[i]
      const charLayers = buildCharacterLayers(char, placement, i)
      result.push(...charLayers)
    }

    return result
  }, [scene, env, char])

  const next = () => {
    if (currentAction < scene.timeline.length - 1) {
      setCurrentAction((a) => a + 1)
    }
  }

  const prev = () => {
    if (currentAction > 0) {
      setCurrentAction((a) => a - 1)
    }
  }

  return (
    <div className="story-player">
      <div className="story-canvas-wrapper">
        <CompositeCanvas
          width={CANVAS_W}
          height={CANVAS_H}
          layers={layers}
          className="story-canvas"
        />
        {dialogText && (
          <div className="story-dialog-bubble">
            <span className="story-dialog-speaker">{dialogSpeaker}</span>
            <span className="story-dialog-text">{dialogText}</span>
          </div>
        )}
      </div>

      <div className="story-controls">
        <button type="button" className="btn btn-secondary" onClick={prev} disabled={currentAction === 0}>
          ← Zurück
        </button>
        <span className="story-progress">
          {currentAction + 1} / {scene.timeline.length}
        </span>
        <button type="button" className="btn btn-primary" onClick={next} disabled={currentAction >= scene.timeline.length - 1}>
          Weiter →
        </button>
      </div>

      <div className="story-scene-info">
        <h3>Szene: {env.name}</h3>
        <p>Figuren: {scene.characters.length} · Aktionen: {scene.timeline.length}</p>
      </div>
    </div>
  )
}
