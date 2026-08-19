import { useCallback, useEffect, useMemo, useState } from 'react'
import { CompositeCanvas, type LayerImage, type LayerAnimation } from './CompositeCanvas'
import { api } from '../api/client'
import type { CharacterAsset, EnvironmentAsset, Scene, StoryLibraryAsset } from '../../shared/story-types'
import type { ScenePreset } from '../../shared/scene-presets'
import { SCENE_PRESETS } from '../../shared/scene-presets'

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

function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}

function presetLayersToCanvas(
  preset: ScenePreset | null,
  canvasW: number,
  canvasH: number,
): LayerImage[] {
  if (!preset) return []
  return preset.layers.map((layer) => ({
    id: `preset-${layer.id}`,
    src: layer.src,
    x: (layer.position.x / 100) * canvasW - layer.size.w / 2,
    y: (layer.position.y / 100) * canvasH - layer.size.h / 2,
    width: layer.size.w,
    height: layer.size.h,
    zIndex: layer.zIndex,
  }))
}

export function StoryPlayerPage() {
  const [currentAction, setCurrentAction] = useState(0)
  const [dialogText, setDialogText] = useState('')
  const [dialogSpeaker, setDialogSpeaker] = useState('')
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [environmentName, setEnvironmentName] = useState('Wohnzimmer')
  const [environmentDescription, setEnvironmentDescription] = useState(
    'cozy family living room, yellow sofa, wooden coffee table with vase, newspapers on floor, warm evening light',
  )
  const [generatingEnvironment, setGeneratingEnvironment] = useState(false)
  const [environmentError, setEnvironmentError] = useState('')
  const [generatedEnvironments, setGeneratedEnvironments] = useState<
    Array<{ name: string; imageUrl: string }>
  >([])
  const [characterName, setCharacterName] = useState('Julien')
  const [characterDescription, setCharacterDescription] = useState(
    '8-year-old boy, round glasses, short brown hair, red t-shirt, blue jeans, friendly smile',
  )
  const [generatingCharacter, setGeneratingCharacter] = useState(false)
  const [characterError, setCharacterError] = useState('')
  const [generatedCharacters, setGeneratedCharacters] = useState<
    Array<{ name: string; imageUrl: string }>
  >([])
  const [leftCharacterImage, setLeftCharacterImage] = useState<string | null>(null)
  const [rightCharacterImage, setRightCharacterImage] = useState<string | null>(null)
  const [libraryAssets, setLibraryAssets] = useState<StoryLibraryAsset[]>([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [saveTagsInput, setSaveTagsInput] = useState('wohnzimmer, kinderbuch')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [activeEnvironmentUrl, setActiveEnvironmentUrl] = useState<string | null>(null)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [presets] = useState<ScenePreset[]>(SCENE_PRESETS)

  const scene = demoScene
  const env = demoEnvironment
  const char = demoCharacter

  const activePreset = useMemo(
    () => presets.find((p) => p.id === activePresetId) ?? null,
    [presets, activePresetId],
  )

  const reloadLibrary = useCallback(async () => {
    setLibraryLoading(true)
    setLibraryError('')
    try {
      const { assets } = await api.story.listLibrary()
      setLibraryAssets(assets)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Bibliothek konnte nicht geladen werden.')
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadLibrary()
  }, [reloadLibrary])

  const filteredLibrary = useMemo(() => {
    const needle = tagFilter.trim().toLowerCase()
    if (!needle) return libraryAssets
    return libraryAssets.filter((asset) =>
      asset.tags.some((tag) => tag.includes(needle) || needle.includes(tag)) ||
      asset.name.toLowerCase().includes(needle),
    )
  }, [libraryAssets, tagFilter])

  const libraryCharacters = filteredLibrary.filter((a) => a.type === 'character')
  const libraryEnvironments = filteredLibrary.filter((a) => a.type === 'environment')

  const handleSaveToLibrary = async (input: {
    type: 'character' | 'environment' | 'scene'
    name: string
    description?: string
    imageUrl: string
    key: string
  }) => {
    setSavingId(input.key)
    try {
      const { asset } = await api.story.saveToLibrary({
        type: input.type,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        tags: parseTagsInput(saveTagsInput),
      })
      setLibraryAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)])
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSavingId(null)
    }
  }

  const handleDeleteFromLibrary = async (id: string) => {
    try {
      await api.story.deleteFromLibrary(id)
      setLibraryAssets((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    }
  }

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

    const activeBackground =
      activeEnvironmentUrl ??
      generatedEnvironments[0]?.imageUrl ??
      env.background

    const usingCustomBackground =
      Boolean(activeEnvironmentUrl) || generatedEnvironments.length > 0

    // Hintergrund
    result.push({
      id: 'bg',
      src: activeBackground,
      x: 0,
      y: 0,
      width: CANVAS_W,
      height: CANVAS_H,
      zIndex: 0,
    })

    if (!usingCustomBackground) {
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
    }

    // Szenen-Preset (Tisch, Stühle, …)
    result.push(...presetLayersToCanvas(activePreset, CANVAS_W, CANVAS_H))

    // Figuren
    for (let i = 0; i < scene.characters.length; i++) {
      const placement = scene.characters[i]
      if (i === 0 && leftCharacterImage) {
        result.push({
          id: 'char-left-generated',
          src: leftCharacterImage,
          x: (placement.position.x / 100) * CANVAS_W - 110,
          y: (placement.position.y / 100) * CANVAS_H - 290,
          width: 220,
          height: 300,
          zIndex: 20,
        })
        continue
      }
      if (i === 1 && rightCharacterImage) {
        result.push({
          id: 'char-right-generated',
          src: rightCharacterImage,
          x: (placement.position.x / 100) * CANVAS_W - 110,
          y: (placement.position.y / 100) * CANVAS_H - 290,
          width: 220,
          height: 300,
          zIndex: 21,
          flip: placement.flip,
        })
        continue
      }
      const charLayers = buildCharacterLayers(char, placement, i)
      result.push(...charLayers)
    }

    return result
  }, [
    scene,
    env,
    char,
    generatedEnvironments,
    leftCharacterImage,
    rightCharacterImage,
    activeEnvironmentUrl,
    activePreset,
  ])

  const usingCustomBackground =
    Boolean(activeEnvironmentUrl) || generatedEnvironments.length > 0

  const sceneAnimations = useMemo<LayerAnimation[]>(() => [
    ...(!usingCustomBackground
      ? [
          { layerId: 'cloud-1', type: 'drift', speed: 12, direction: { x: 1, y: 0 }, wrap: true, wrapMargin: 250 } as LayerAnimation,
          { layerId: 'cloud-2', type: 'drift', speed: 8, direction: { x: 1, y: 0 }, wrap: true, wrapMargin: 200 } as LayerAnimation,
          { layerId: 'cloud-3', type: 'drift', speed: 15, direction: { x: 1, y: 0 }, wrap: true, wrapMargin: 200 } as LayerAnimation,
          { layerId: 'tree-left', type: 'swing', amplitude: 1.5, period: 4000 } as LayerAnimation,
          { layerId: 'tree-right', type: 'swing', amplitude: 2, period: 3500 } as LayerAnimation,
        ]
      : []),
    ...(leftCharacterImage
      ? [{ layerId: 'char-left-generated', type: 'bob', amplitude: 1.2, period: 4800 } as LayerAnimation]
      : [
          { layerId: 'char-0-head', type: 'blink', blinkDuration: 150, blinkInterval: [2500, 5500] } as LayerAnimation,
          { layerId: 'char-0-body', type: 'bob', amplitude: 1.5, period: 5000 } as LayerAnimation,
        ]),
    ...(rightCharacterImage
      ? [{ layerId: 'char-right-generated', type: 'bob', amplitude: 1.1, period: 4300 } as LayerAnimation]
      : [
          { layerId: 'char-1-head', type: 'blink', blinkDuration: 130, blinkInterval: [3000, 6000] } as LayerAnimation,
          { layerId: 'char-1-body', type: 'bob', amplitude: 1.2, period: 4500 } as LayerAnimation,
        ]),
  ], [leftCharacterImage, rightCharacterImage, usingCustomBackground])

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

  const handleGenerateCharacter = async () => {
    const name = characterName.trim()
    const description = characterDescription.trim()
    if (!name || !description) return
    setGeneratingCharacter(true)
    setCharacterError('')
    try {
      const result = await api.story.generateCharacter(name, description)
      setGeneratedCharacters((prev) => [{ name, imageUrl: result.imageUrl }, ...prev].slice(0, 12))
    } catch (err) {
      setCharacterError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setGeneratingCharacter(false)
    }
  }

  const handleGenerateEnvironment = async () => {
    const name = environmentName.trim()
    const description = environmentDescription.trim()
    if (!name || !description) return
    setGeneratingEnvironment(true)
    setEnvironmentError('')
    try {
      const result = await api.story.generateEnvironment(name, description)
      setGeneratedEnvironments((prev) => [{ name, imageUrl: result.imageUrl }, ...prev].slice(0, 8))
      setActiveEnvironmentUrl(result.imageUrl)
    } catch (err) {
      setEnvironmentError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setGeneratingEnvironment(false)
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
        <h3>Szene: {env.name}{activePreset ? ` · ${activePreset.name}` : ''}</h3>
        <p>Figuren: {scene.characters.length} · Aktionen: {scene.timeline.length}</p>
      </div>

      <section className="story-generate-panel">
        <h3>Story-Bibliothek</h3>
        <p className="muted">
          Gespeicherte Figuren und Umgebungen mit Tags — einmal erzeugen, immer wieder verwenden.
        </p>
        <div className="story-library-toolbar">
          <input
            type="text"
            className="input"
            placeholder="Tags filtern (z.B. wohnzimmer, mann)"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
          <input
            type="text"
            className="input"
            placeholder="Tags beim Speichern (Komma-getrennt)"
            value={saveTagsInput}
            onChange={(e) => setSaveTagsInput(e.target.value)}
          />
        </div>
        {libraryError && <p className="alert alert-error">{libraryError}</p>}
        {libraryLoading ? (
          <p className="muted">Bibliothek wird geladen …</p>
        ) : (
          <>
            {libraryEnvironments.length > 0 && (
              <>
                <h4 className="story-library-heading">Umgebungen</h4>
                <div className="story-character-grid">
                  {libraryEnvironments.map((item) => (
                    <article key={item.id} className="story-character-card">
                      <img src={item.imageUrl} alt={`Umfeld ${item.name}`} />
                      <p>{item.name}</p>
                      <div className="story-tag-row">
                        {item.tags.map((tag) => (
                          <span key={tag} className="story-tag">{tag}</span>
                        ))}
                      </div>
                      <div className="story-character-card-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setActiveEnvironmentUrl(item.imageUrl)}
                        >
                          Als Szene
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void handleDeleteFromLibrary(item.id)}
                        >
                          Löschen
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {libraryCharacters.length > 0 && (
              <>
                <h4 className="story-library-heading">Figuren</h4>
                <div className="story-character-grid">
                  {libraryCharacters.map((item) => (
                    <article key={item.id} className="story-character-card">
                      <img src={item.imageUrl} alt={`Figur ${item.name}`} />
                      <p>{item.name}</p>
                      <div className="story-tag-row">
                        {item.tags.map((tag) => (
                          <span key={tag} className="story-tag">{tag}</span>
                        ))}
                      </div>
                      <div className="story-character-card-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setLeftCharacterImage(item.imageUrl)}
                        >
                          Als links
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setRightCharacterImage(item.imageUrl)}
                        >
                          Als rechts
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => void handleDeleteFromLibrary(item.id)}
                        >
                          Löschen
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {libraryAssets.length === 0 && (
              <p className="muted">Noch leer — erzeuge Figuren/Umgebungen und speichere sie unten in der Bibliothek.</p>
            )}
          </>
        )}
      </section>

      <section className="story-generate-panel">
        <h3>Szenen-Presets</h3>
        <p className="muted">
          Fertige Arrangements wie «Wohnzimmer-Abendessen» — Tisch, Stühle, Teller werden als Layer über dein Umfeld gelegt.
        </p>
        <div className="story-preset-list">
          {presets.map((preset) => (
            <article
              key={preset.id}
              className={`story-preset-card${activePresetId === preset.id ? ' is-active' : ''}`}
            >
              <div>
                <strong>{preset.name}</strong>
                <p className="muted">{preset.description}</p>
                <div className="story-tag-row">
                  {preset.tags.map((tag) => (
                    <span key={tag} className="story-tag">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="story-preset-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setActivePresetId(preset.id)}
                >
                  Anwenden
                </button>
                {activePresetId === preset.id && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setActivePresetId(null)}
                  >
                    Entfernen
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="story-generate-panel">
        <h3>KI-Szene generieren (Kinderbuch-Stil)</h3>
        <p className="muted">Beschreibe eine Szene — KI zeichnet sie im warmen Aquarell-Kinderbuchstil.</p>
        <div className="story-generate-row">
          <input
            type="text"
            className="input"
            placeholder="z.B. Wohnzimmer mit Sofa, Couchtisch, Zeitungen am Boden, Vater am Esstisch mit Spaghetti"
            id="scene-desc"
            disabled={generating}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={generating}
            onClick={async () => {
              const input = document.getElementById('scene-desc') as HTMLInputElement
              const desc = input?.value?.trim()
              if (!desc) return
              setGenerating(true)
              setGenError('')
              try {
                const result = await api.story.generateScene(desc)
                setGeneratedImage(result.imageUrl)
              } catch (err) {
                setGenError(err instanceof Error ? err.message : 'Fehler')
              } finally {
                setGenerating(false)
              }
            }}
          >
            {generating ? 'Zeichne …' : 'Szene zeichnen'}
          </button>
        </div>
        {genError && <p className="alert alert-error">{genError}</p>}
        {generatedImage && (
          <div className="story-generated-preview">
            <img src={generatedImage} alt="Generierte Szene" />
            <div className="story-character-card-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveEnvironmentUrl(generatedImage)}
              >
                Als Szene-Hintergrund
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={savingId === 'scene-preview'}
                onClick={() =>
                  void handleSaveToLibrary({
                    type: 'scene',
                    name: 'Generierte Szene',
                    imageUrl: generatedImage,
                    key: 'scene-preview',
                  })
                }
              >
                {savingId === 'scene-preview' ? 'Speichere …' : 'In Bibliothek'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="story-generate-panel">
        <h3>KI-Figur generieren (gleicher Stil)</h3>
        <p className="muted">
          Erstelle passende Charaktere für deine Geschichten. Die Bilder kannst du danach wiederverwenden.
        </p>
        <div className="story-character-form">
          <input
            type="text"
            className="input"
            placeholder="Figurenname (z.B. Julien)"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            disabled={generatingCharacter}
          />
          <textarea
            className="input"
            rows={3}
            placeholder="Beschreibung (Alter, Haare, Kleidung, Ausdruck...)"
            value={characterDescription}
            onChange={(e) => setCharacterDescription(e.target.value)}
            disabled={generatingCharacter}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={generatingCharacter}
            onClick={handleGenerateCharacter}
          >
            {generatingCharacter ? 'Erzeuge Figur …' : 'Figur erzeugen'}
          </button>
        </div>
        {characterError && <p className="alert alert-error">{characterError}</p>}
        {generatedCharacters.length > 0 && (
          <div className="story-character-grid">
            {generatedCharacters.map((item, idx) => (
              <article key={`${item.name}-${idx}`} className="story-character-card">
                <img src={item.imageUrl} alt={`Figur ${item.name}`} />
                <p>{item.name}</p>
                <div className="story-character-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setLeftCharacterImage(item.imageUrl)}
                  >
                    Als links
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setRightCharacterImage(item.imageUrl)}
                  >
                    Als rechts
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={savingId === `char-${idx}`}
                    onClick={() =>
                      void handleSaveToLibrary({
                        type: 'character',
                        name: item.name,
                        description: characterDescription,
                        imageUrl: item.imageUrl,
                        key: `char-${idx}`,
                      })
                    }
                  >
                    {savingId === `char-${idx}` ? 'Speichere …' : 'In Bibliothek'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="story-generate-panel">
        <h3>KI-Umfeld generieren (gleicher Stil)</h3>
        <p className="muted">
          Erzeuge Hintergründe wie Wohnzimmer, Küche, Museum oder Schwimmbad und setze sie direkt als Szene.
        </p>
        <div className="story-character-form">
          <input
            type="text"
            className="input"
            placeholder="Umfeldname (z.B. Wohnzimmer)"
            value={environmentName}
            onChange={(e) => setEnvironmentName(e.target.value)}
            disabled={generatingEnvironment}
          />
          <textarea
            className="input"
            rows={3}
            placeholder="Beschreibung (Möbel, Licht, Details...)"
            value={environmentDescription}
            onChange={(e) => setEnvironmentDescription(e.target.value)}
            disabled={generatingEnvironment}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={generatingEnvironment}
            onClick={handleGenerateEnvironment}
          >
            {generatingEnvironment ? 'Erzeuge Umfeld …' : 'Umfeld erzeugen'}
          </button>
        </div>
        {environmentError && <p className="alert alert-error">{environmentError}</p>}
        {generatedEnvironments.length > 0 && (
          <div className="story-character-grid">
            {generatedEnvironments.map((item, idx) => (
              <article key={`${item.name}-${idx}`} className="story-character-card">
                <img src={item.imageUrl} alt={`Umfeld ${item.name}`} />
                <p>{item.name}</p>
                <div className="story-character-card-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setActiveEnvironmentUrl(item.imageUrl)}
                  >
                    Als Szene
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={savingId === `env-${idx}`}
                    onClick={() =>
                      void handleSaveToLibrary({
                        type: 'environment',
                        name: item.name,
                        description: environmentDescription,
                        imageUrl: item.imageUrl,
                        key: `env-${idx}`,
                      })
                    }
                  >
                    {savingId === `env-${idx}` ? 'Speichere …' : 'In Bibliothek'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
