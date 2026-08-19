import { useEffect, useMemo, useState } from 'react'
import { CompositeCanvas, type LayerImage, type LayerAnimation } from './CompositeCanvas'
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

  const bodyH = (bodyLayer?.size.h ?? 400) * scale

  if (armsLayer) {
    const w = armsLayer.size.w * scale
    const h = armsLayer.size.h * scale
    result.push({
      id: `char-${index}-arms`,
      src: armsLayer.src,
      x: baseX - w * armsLayer.anchor.x,
      y: baseY - bodyH * 0.7,
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
      y: baseY - bodyH * 0.95,
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

    // Wolken (separate Layers für Animation)
    result.push({
      id: 'cloud-1',
      src: '/assets/environments/park/cloud1.svg',
      x: 150,
      y: 50,
      width: 200,
      height: 80,
      opacity: 0.8,
      zIndex: 1,
    })
    result.push({
      id: 'cloud-2',
      src: '/assets/environments/park/cloud2.svg',
      x: 700,
      y: 30,
      width: 160,
      height: 60,
      opacity: 0.65,
      zIndex: 1,
    })
    result.push({
      id: 'cloud-3',
      src: '/assets/environments/park/cloud3.svg',
      x: 450,
      y: 100,
      width: 140,
      height: 55,
      opacity: 0.55,
      zIndex: 1,
    })

    // Bäume (separate für Wind-Animation)
    result.push({
      id: 'tree-left',
      src: '/assets/environments/park/tree-left.svg',
      x: 20,
      y: 200,
      width: 160,
      height: 320,
      zIndex: 2,
      rotationAnchor: { x: 0.5, y: 1 },
    })
    result.push({
      id: 'tree-right',
      src: '/assets/environments/park/tree-right.svg',
      x: 1070,
      y: 220,
      width: 140,
      height: 290,
      zIndex: 2,
      rotationAnchor: { x: 0.5, y: 1 },
    })

    // Figuren
    for (let i = 0; i < scene.characters.length; i++) {
      const placement = scene.characters[i]
      const charLayers = buildCharacterLayers(char, placement, i)
      result.push(...charLayers)
    }

    return result
  }, [scene, env, char])

  const sceneAnimations = useMemo<LayerAnimation[]>(() => [
    { layerId: 'cloud-1', type: 'drift', speed: 12, direction: { x: 1, y: 0 }, wrap: true, wrapMargin: 250 },
    { layerId: 'cloud-2', type: 'drift', speed: 8, direction: { x: 1, y: 0 }, wrap: true, wrapMargin: 200 },
    { layerId: 'cloud-3', type: 'drift', speed: 15, direction: { x: 1, y: 0 }, wrap: true, wrapMargin: 200 },
    { layerId: 'tree-left', type: 'swing', amplitude: 1.5, period: 4000 },
    { layerId: 'tree-right', type: 'swing', amplitude: 2, period: 3500 },
    { layerId: 'char-0-head', type: 'blink', blinkDuration: 150, blinkInterval: [2500, 5500] },
    { layerId: 'char-1-head', type: 'blink', blinkDuration: 130, blinkInterval: [3000, 6000] },
    { layerId: 'char-0-body', type: 'bob', amplitude: 1.5, period: 5000 },
    { layerId: 'char-1-body', type: 'bob', amplitude: 1.2, period: 4500 },
  ], [])

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
          animations={sceneAnimations}
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
