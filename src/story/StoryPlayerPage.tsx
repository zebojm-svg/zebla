import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CompositeCanvas, type LayerImage, type LayerAnimation } from './CompositeCanvas'
import { api } from '../api/client'
import type { CharacterAsset, EnvironmentAsset, Scene, StoryLibraryAsset } from '../../shared/story-types'
import type { ScenePreset } from '../../shared/scene-presets'
import { SCENE_PRESETS } from '../../shared/scene-presets'
import { StoryWorkflowNav, type StoryWorkflowStep } from './StoryWorkflowNav'
import {
  placeInCast,
  updateCastName,
  updateCastPose,
  updateCastLookAt,
  updateCastTransform,
  nudgeCastTransform,
  swapCastVariant,
  getCastLayerLayout,
  castLayerId,
  type SceneCast,
  type CastPose,
} from './story-cast'
import { CastTransformControls } from './CastTransformControls'
import {
  HEAD_ANGLES,
  LEG_POSES,
  POSE_SETS,
  characterBaseName,
  headAngleLabel,
  isHeadAngleId,
  isLegPoseId,
  legPoseLabel,
  poseMatrixSize,
  poseSetCombos,
  poseSetCount,
  poseVariantLabel,
  type HeadAngleId,
  type LegPoseId,
  type PoseSetId,
} from '../../shared/character-parts'
import {
  availableHeadAngles,
  availableLegPoses,
  collectPoseVariants,
  findPoseVariant,
} from './pose-variants'
import { StoryCharacterCard, StoryEnvironmentCard } from './StoryAssetCards'
import { StoryStylePicker, loadStoryArtStyle, storyStyleLabel } from './StoryStylePicker'
import type { StoryArtStyleId } from '../../shared/story-art-styles'
import {
  STORY_CHARACTER_LOOKS,
  descriptionForCharacterName,
  isKnownLookDescription,
  lookForCharacterName,
  normalizeCharacterLookName,
} from '../../shared/story-character-looks'

type StoryTab = 'szene' | 'bibliothek' | 'erzeugen'

type LayerOverride = { visible: boolean; hueRotate: number }

type SessionCharacter = {
  name: string
  imageUrl: string
  description?: string
  styleId: StoryArtStyleId
  legPose?: LegPoseId
  headAngle?: HeadAngleId
}
type SessionEnvironment = {
  name: string
  imageUrl: string
  styleId: StoryArtStyleId
}

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
  overrides: Record<string, LayerOverride>,
): LayerImage[] {
  if (!preset) return []
  return preset.layers
    .filter((layer) => overrides[layer.id]?.visible !== false)
    .map((layer) => ({
      id: `preset-${layer.id}`,
      src: layer.src,
      x: (layer.position.x / 100) * canvasW - layer.size.w / 2,
      y: (layer.position.y / 100) * canvasH - layer.size.h / 2,
      width: layer.size.w,
      height: layer.size.h,
      zIndex: layer.zIndex,
      hueRotate: overrides[layer.id]?.hueRotate || undefined,
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
  const [generatedEnvironments, setGeneratedEnvironments] = useState<SessionEnvironment[]>([])
  const [artStyle, setArtStyle] = useState<StoryArtStyleId>(() => loadStoryArtStyle())
  const [generatedSceneStyleId, setGeneratedSceneStyleId] = useState<StoryArtStyleId | null>(null)
  const [characterName, setCharacterName] = useState('Julien')
  const [characterDescription, setCharacterDescription] = useState(
    () => descriptionForCharacterName('Julien') ?? '',
  )
  const [generatingCharacter, setGeneratingCharacter] = useState(false)
  const [characterError, setCharacterError] = useState('')
  const [generatedCharacters, setGeneratedCharacters] = useState<SessionCharacter[]>([])
  const [cast, setCast] = useState<SceneCast>({ left: null, right: null })
  const [activeTab, setActiveTab] = useState<StoryTab>('szene')
  const [workflowStep, setWorkflowStep] = useState<StoryWorkflowStep>('scene')
  const [layerOverrides, setLayerOverrides] = useState<Record<string, LayerOverride>>({})
  const sessionGalleryRef = useRef<HTMLDivElement>(null)
  const [libraryAssets, setLibraryAssets] = useState<StoryLibraryAsset[]>([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [saveTagsInput, setSaveTagsInput] = useState('wohnzimmer, kinderbuch')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [activeEnvironmentUrl, setActiveEnvironmentUrl] = useState<string | null>(null)
  const [activeEnvironmentName, setActiveEnvironmentName] = useState<string | null>(null)
  const [sceneNotice, setSceneNotice] = useState('')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [selectedCastLayer, setSelectedCastLayer] = useState<string | null>(null)
  const [generateLegPose, setGenerateLegPose] = useState<LegPoseId>('standing')
  const [generateHeadAngle, setGenerateHeadAngle] = useState<HeadAngleId>('front')
  const [generatePoseSet, setGeneratePoseSet] = useState<PoseSetId>('sofa-dialogue')
  const [generatingPoseBatch, setGeneratingPoseBatch] = useState(false)
  const [poseBatchProgress, setPoseBatchProgress] = useState('')
  const [presets] = useState<ScenePreset[]>(SCENE_PRESETS)

  const scene = demoScene
  const env = demoEnvironment
  const char = demoCharacter

  const activePreset = useMemo(
    () => presets.find((p) => p.id === activePresetId) ?? null,
    [presets, activePresetId],
  )

  const handleApplyBackground = (name: string, imageUrl: string) => {
    setActiveEnvironmentUrl(imageUrl)
    setActiveEnvironmentName(name)
    setActiveTab('szene')
    setWorkflowStep('scene')
    setSceneNotice(`Hintergrund «${name}» ist gesetzt — jetzt Figuren platzieren (Tab Bibliothek).`)
  }

  const activeSceneTitle =
    activeEnvironmentName ??
    (activeEnvironmentUrl ? 'Eigenes Umfeld' : generatedEnvironments[0]?.name ?? env.name)

  useEffect(() => {
    if (!sceneNotice) return
    const timer = setTimeout(() => setSceneNotice(''), 8000)
    return () => clearTimeout(timer)
  }, [sceneNotice])

  useEffect(() => {
    if (!activePreset) {
      setLayerOverrides({})
      return
    }
    const next: Record<string, LayerOverride> = {}
    for (const layer of activePreset.layers) {
      next[layer.id] = { visible: true, hueRotate: 0 }
    }
    setLayerOverrides(next)
  }, [activePresetId, activePreset])

  const handlePlaceCharacter = (
    slot: 'left' | 'right',
    input: {
      imageUrl: string
      assetName: string
      libraryAssetId?: string
      displayName?: string
      pose?: CastPose
      legPose?: LegPoseId
      headAngle?: HeadAngleId
    },
  ) => {
    setCast((prev) => {
      const sitting = input.legPose?.startsWith('sitting')
      let next = placeInCast(prev, slot, {
        ...input,
        pose: input.pose ?? (sitting ? 'sitting-sofa' : 'standing'),
      })
      if (next.left && next.right) {
        next = {
          left: { ...next.left, lookAtPartner: true },
          right: { ...next.right, lookAtPartner: true },
        }
      }
      return next
    })
    setActiveTab('szene')
    setWorkflowStep('scene')
  }

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
    styleId?: StoryArtStyleId
    legPoseId?: LegPoseId
    headAngleId?: HeadAngleId
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
        styleId: input.styleId ?? artStyle,
        legPoseId: input.legPoseId,
        headAngleId: input.headAngleId,
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

  const handleSaveAllSessionCharacters = async () => {
    if (generatedCharacters.length === 0) return
    setSavingId('session-chars-all')
    try {
      for (const item of generatedCharacters) {
        const { asset } = await api.story.saveToLibrary({
          type: 'character',
          name: characterBaseName(item.name),
          description: item.description,
          imageUrl: item.imageUrl,
          tags: [
            ...parseTagsInput(saveTagsInput),
            ...(item.headAngle ? [item.headAngle] : []),
            ...(item.legPose ? [item.legPose] : []),
          ],
          styleId: item.styleId ?? artStyle,
          legPoseId: item.legPose,
          headAngleId: item.headAngle,
        })
        setLibraryAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)])
      }
      setSceneNotice(`${generatedCharacters.length} Figuren-Posen in die Bibliothek gespeichert.`)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSavingId(null)
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
    result.push(...presetLayersToCanvas(activePreset, CANVAS_W, CANVAS_H, layerOverrides))

    // Figuren
    for (let i = 0; i < scene.characters.length; i++) {
      const placement = scene.characters[i]
      const castMember = i === 0 ? cast.left : i === 1 ? cast.right : null
      if (castMember) {
        const layout = getCastLayerLayout(castMember, CANVAS_W, CANVAS_H)
        result.push({
          id: castLayerId(castMember.slot),
          src: castMember.imageUrl,
          x: layout.x,
          y: layout.y,
          width: layout.width,
          height: layout.height,
          zIndex: layout.zIndex,
          flip: layout.flip,
          rotation: layout.rotation,
          rotationAnchor: { x: 0.5, y: 1 },
          keyOutWhite: true,
          sourceCrop: layout.sourceCrop,
          draggable: true,
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
    activeEnvironmentUrl,
    activePreset,
    layerOverrides,
    cast,
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
    ...(cast.left
      ? [{ layerId: 'char-left-generated', type: 'bob', amplitude: 1.2, period: 4800 } as LayerAnimation]
      : [
          { layerId: 'char-0-head', type: 'blink', blinkDuration: 150, blinkInterval: [2500, 5500] } as LayerAnimation,
          { layerId: 'char-0-body', type: 'bob', amplitude: 1.5, period: 5000 } as LayerAnimation,
        ]),
    ...(cast.right
      ? [{ layerId: 'char-right-generated', type: 'bob', amplitude: 1.1, period: 4300 } as LayerAnimation]
      : [
          { layerId: 'char-1-head', type: 'blink', blinkDuration: 130, blinkInterval: [3000, 6000] } as LayerAnimation,
          { layerId: 'char-1-body', type: 'bob', amplitude: 1.2, period: 4500 } as LayerAnimation,
        ]),
  ], [cast.left, cast.right, usingCustomBackground])

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

  const applyCharacterName = (nextName: string) => {
    setCharacterName(nextName)
    if (isKnownLookDescription(characterDescription)) {
      const nextDesc = descriptionForCharacterName(nextName)
      if (nextDesc) setCharacterDescription(nextDesc)
    }
  }

  const handleGenerateCharacter = async () => {
    const name = characterName.trim()
    const description = characterDescription.trim()
    if (!name || !description) return
    setGeneratingCharacter(true)
    setCharacterError('')
    try {
      const result = await api.story.generateCharacter(
        name,
        description,
        artStyle,
        generateLegPose,
        generateHeadAngle,
      )
      setGeneratedCharacters((prev) =>
        [
          {
            name,
            imageUrl: result.imageUrl,
            description,
            styleId: result.styleId as StoryArtStyleId,
            legPose: generateLegPose,
            headAngle: generateHeadAngle,
          },
          ...prev,
        ].slice(0, 48),
      )
      setActiveTab('bibliothek')
      setWorkflowStep('assets')
      requestAnimationFrame(() => {
        sessionGalleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (err) {
      setCharacterError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setGeneratingCharacter(false)
    }
  }

  const handleGeneratePoseBatch = async (setId: PoseSetId = generatePoseSet) => {
    const name = characterName.trim()
    const description = characterDescription.trim()
    if (!name || !description) return
    const combos = poseSetCombos(setId, generateLegPose)
    if (combos.length === 0) return
    setGeneratePoseSet(setId)
    setGeneratingPoseBatch(true)
    setCharacterError('')
    setPoseBatchProgress(`0 / ${combos.length}`)
    const created: SessionCharacter[] = []
    try {
      for (let i = 0; i < combos.length; i++) {
        const { head, leg } = combos[i]
        setPoseBatchProgress(`${i + 1} / ${combos.length} · ${poseVariantLabel(head, leg)}`)
        const result = await api.story.generateCharacter(name, description, artStyle, leg, head)
        created.push({
          name: `${name} · ${poseVariantLabel(head, leg)}`,
          imageUrl: result.imageUrl,
          description,
          styleId: result.styleId as StoryArtStyleId,
          legPose: leg,
          headAngle: head,
        })
      }
      setGeneratedCharacters((prev) => [...created, ...prev].slice(0, 56))
      setActiveTab('bibliothek')
      setWorkflowStep('assets')
      setSceneNotice(
        `${created.length} Pose-Varianten für «${name}» erzeugt — speichern, dann in der Besetzung Blick/Pose wechseln.`,
      )
    } catch (err) {
      setCharacterError(err instanceof Error ? err.message : 'Pose-Serie fehlgeschlagen.')
    } finally {
      setGeneratingPoseBatch(false)
      setPoseBatchProgress('')
    }
  }

  const handleGenerateEnvironment = async () => {
    const name = environmentName.trim()
    const description = environmentDescription.trim()
    if (!name || !description) return
    setGeneratingEnvironment(true)
    setEnvironmentError('')
    try {
      const result = await api.story.generateEnvironment(name, description, artStyle)
      setGeneratedEnvironments((prev) =>
        [{ name, imageUrl: result.imageUrl, styleId: result.styleId as StoryArtStyleId }, ...prev].slice(0, 8),
      )
      handleApplyBackground(name, result.imageUrl)
    } catch (err) {
      setEnvironmentError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setGeneratingEnvironment(false)
    }
  }

  const goToSofaDialogSet = () => {
    setGeneratePoseSet('sofa-dialogue')
    setGenerateLegPose('standing')
    setActiveTab('erzeugen')
    setWorkflowStep('assets')
    setSceneNotice('Hier: Julien oder Lucien wählen, dann «Ganze Figur erzeugen» — Füße müssen im Bild sein.')
  }

  const castNames = [cast.left?.displayName, cast.right?.displayName].filter(Boolean).join(', ')
  const activeLook = lookForCharacterName(characterName)

  const handleWorkflowStep = (step: StoryWorkflowStep) => {
    setWorkflowStep(step)
    if (step === 'assets') setActiveTab('bibliothek')
    if (step === 'scene') setActiveTab('szene')
    if (step === 'actions') setActiveTab('szene')
  }

  return (
    <div className="story-player">
      <header className="story-page-header">
        <h2>Story-Studio</h2>
        <p className="muted">
          Dialog → Bilder aus Bibliothek → Aktionen → Szene. Alles aus der Bibliothek kostet keine KI-Credits.
        </p>
        <p className="alert alert-info story-notice">
          Alte Figuren in der Bibliothek bleiben unverändert (flacher Stil, Beine oft abgeschnitten). Stil und
          Füße siehst du erst nach <strong>neu erzeugen</strong> unter «KI erzeugen». Bildstil oben auf
          «Lebendige Illustration» lassen.
        </p>
      </header>

      <StoryWorkflowNav active={workflowStep} onStep={handleWorkflowStep} />

      <div className="story-style-bar">
        <StoryStylePicker value={artStyle} onChange={setArtStyle} />
        <p className="muted story-style-bar-note">
          Gilt für alle KI-Generierungen. Bibliothek wiederverwenden = kein neuer Stil-Lauf nötig.
        </p>
      </div>

      <div className="story-tabs" role="tablist">
        {([
          ['szene', 'Szene'],
          ['bibliothek', 'Bibliothek'],
          ['erzeugen', 'KI erzeugen'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={`story-tab${activeTab === id ? ' is-active' : ''}`}
            onClick={() => {
              setActiveTab(id)
              if (id === 'bibliothek') setWorkflowStep('assets')
              if (id === 'erzeugen') setWorkflowStep('assets')
              if (id === 'szene') setWorkflowStep('scene')
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {(activeTab === 'szene' || activeTab === 'bibliothek') && (
        <>
          <div className="story-canvas-wrapper">
            <CompositeCanvas
              width={CANVAS_W}
              height={CANVAS_H}
              layers={layers}
              animations={sceneAnimations}
              className="story-canvas"
              selectedLayerId={selectedCastLayer}
              onSelectLayer={setSelectedCastLayer}
              onDragLayer={(layerId, dx, dy) => {
                const slot = layerId.includes('left') ? 'left' : layerId.includes('right') ? 'right' : null
                if (!slot) return
                setCast((prev) => nudgeCastTransform(prev, slot, dx, dy))
              }}
              onWheelLayer={(layerId, deltaScale) => {
                const slot = layerId.includes('left') ? 'left' : layerId.includes('right') ? 'right' : null
                if (!slot) return
                setCast((prev) => {
                  const member = prev[slot]
                  if (!member) return prev
                  const nextScale = Math.min(1.8, Math.max(0.4, member.transform.scale + deltaScale))
                  return updateCastTransform(prev, slot, { scale: nextScale })
                })
              }}
              onRotateLayer={(layerId, deltaRotation) => {
                const slot = layerId.includes('left') ? 'left' : layerId.includes('right') ? 'right' : null
                if (!slot) return
                setCast((prev) => {
                  const member = prev[slot]
                  if (!member) return prev
                  return updateCastTransform(prev, slot, {
                    rotation: Math.max(-90, Math.min(90, member.transform.rotation + deltaRotation)),
                  })
                })
              }}
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
            <h3>
              Hintergrund: {activeSceneTitle}
              {activePreset ? ` · ${activePreset.name}` : ''}
            </h3>
            <p>
              Besetzung: {castNames || '—'} · Aktionen: {scene.timeline.length}
            </p>
            {!activeEnvironmentUrl && generatedEnvironments.length === 0 && (
              <p className="story-scene-hint">
                Noch kein Hintergrund — unter «Bibliothek» bei Wohnzimmer auf <strong>Hintergrund setzen</strong> klicken.
              </p>
            )}
          </div>
          {sceneNotice && <p className="alert alert-success story-notice">{sceneNotice}</p>}
        </>
      )}

      {activeTab === 'szene' && (
        <>
          <section className="story-generate-panel story-steps-panel">
            <h3>So baust du die Szene</h3>
            <ol className="story-steps-list">
              <li className={activeEnvironmentUrl ? 'is-done' : 'is-current'}>
                <strong>Hintergrund wählen</strong> — Wohnzimmer aus der Bibliothek (unten oder Tab Bibliothek)
              </li>
              <li className={cast.left || cast.right ? 'is-done' : activeEnvironmentUrl ? 'is-current' : ''}>
                <strong>Figuren platzieren</strong> — Julien «Als links» / «Als rechts»
              </li>
              <li>
                <strong>Pose anpassen</strong> — ziehen, Mausrad, Shift+Drehen, Regler; für Sitzen: «Sitzen (Beine vorne)» erzeugen
              </li>
            </ol>
          </section>

          {libraryEnvironments.length > 0 && (
            <section className="story-generate-panel">
              <h3>Schritt 1 — Hintergrund wählen</h3>
              <p className="muted">Klicke dein Wohnzimmer — es erscheint oben in der Vorschau.</p>
              <div className="story-character-grid">
                {libraryEnvironments.map((item) => (
                  <StoryEnvironmentCard
                    key={`pick-${item.id}`}
                    item={{
                      key: item.id,
                      name: item.name,
                      imageUrl: item.imageUrl,
                      tags: item.tags,
                    }}
                    isActive={activeEnvironmentUrl === item.imageUrl}
                    onUse={() => handleApplyBackground(item.name, item.imageUrl)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="story-generate-panel">
            <h3>Besetzung dieser Szene</h3>
            <p className="muted">
              <strong>Figur ziehen</strong> · Mausrad zoomen · Shift drehen. Wenn mehrere Posen in der Bibliothek
              liegen: hier <strong>Blickrichtung</strong> und <strong>Bein-Pose</strong> umschalten.
            </p>
            <div className="story-cast-grid">
              {(['left', 'right'] as const).map((slot) => {
                const member = cast[slot]
                const label = slot === 'left' ? 'Links' : 'Rechts'
                const variants = member
                  ? collectPoseVariants(member.displayName || member.assetName, libraryCharacters, generatedCharacters)
                  : []
                const headOptions = availableHeadAngles(variants, member?.legPose)
                const legOptions = availableLegPoses(variants)
                return (
                  <div key={slot} className="story-cast-slot">
                    <span className="story-cast-slot-label">{label}</span>
                    {member ? (
                      <>
                        <img src={member.imageUrl} alt={member.displayName} className="story-cast-thumb" />
                        <label className="story-cast-name-label">
                          Sprecher-Name
                          <input
                            type="text"
                            className="input"
                            value={member.displayName}
                            onChange={(e) => setCast((prev) => updateCastName(prev, slot, e.target.value))}
                          />
                        </label>
                        {legOptions.length > 0 && (
                          <label className="story-cast-name-label">
                            Bein-Pose (Bibliothek)
                            <select
                              className="input"
                              value={member.legPose ?? ''}
                              onChange={(e) => {
                                const nextLeg = e.target.value as LegPoseId
                                const match = findPoseVariant(variants, {
                                  legPose: nextLeg,
                                  headAngle: member.headAngle,
                                })
                                if (!match) return
                                setCast((prev) =>
                                  swapCastVariant(prev, slot, {
                                    imageUrl: match.imageUrl,
                                    assetName: match.assetName,
                                    libraryAssetId: match.libraryAssetId,
                                    headAngle: match.headAngle,
                                    legPose: match.legPose,
                                  }),
                                )
                              }}
                            >
                              {!member.legPose && <option value="">—</option>}
                              {legOptions.map((id) => (
                                <option key={id} value={id}>
                                  {legPoseLabel(id)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {headOptions.length > 0 && (
                          <label className="story-cast-name-label">
                            Blickrichtung (Bibliothek)
                            <select
                              className="input"
                              value={member.headAngle ?? ''}
                              onChange={(e) => {
                                const nextHead = e.target.value as HeadAngleId
                                const match = findPoseVariant(variants, {
                                  headAngle: nextHead,
                                  legPose: member.legPose,
                                })
                                if (!match) return
                                setCast((prev) =>
                                  swapCastVariant(prev, slot, {
                                    imageUrl: match.imageUrl,
                                    assetName: match.assetName,
                                    libraryAssetId: match.libraryAssetId,
                                    headAngle: match.headAngle,
                                    legPose: match.legPose,
                                  }),
                                )
                              }}
                            >
                              {!member.headAngle && <option value="">—</option>}
                              {headOptions.map((id) => (
                                <option key={id} value={id}>
                                  {headAngleLabel(id)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {variants.length <= 1 && (
                          <p className="muted story-card-subtitle">
                            Noch keine weiteren Posen — unter «KI erzeugen» 5 Blickrichtungen für{' '}
                            {characterBaseName(member.displayName)} erzeugen.
                          </p>
                        )}
                        <label className="story-cast-name-label">
                          Startposition
                          <select
                            className="input"
                            value={member.pose}
                            onChange={(e) =>
                              setCast((prev) =>
                                updateCastPose(prev, slot, e.target.value as CastPose),
                              )
                            }
                          >
                            <option value="custom">Frei platzieren</option>
                            <option value="sitting-sofa">Start: Sofa (grob)</option>
                            <option value="standing">Start: Stehen</option>
                          </select>
                        </label>
                        <CastTransformControls
                          transform={{
                            ...member.transform,
                            scaleX: member.transform.scaleX ?? 1,
                            scaleY: member.transform.scaleY ?? 1,
                          }}
                          onChange={(patch) =>
                            setCast((prev) => updateCastTransform(prev, slot, patch))
                          }
                          onReset={() =>
                            setCast((prev) =>
                              updateCastPose(prev, slot, member.pose === 'custom' ? 'standing' : member.pose),
                            )
                          }
                        />
                        {(member.legPose || member.headAngle) && (
                          <p className="muted story-card-subtitle">
                            Aktuell: {poseVariantLabel(member.headAngle, member.legPose)}
                          </p>
                        )}
                        <label className="story-cast-look-at">
                          <input
                            type="checkbox"
                            checked={member.lookAtPartner}
                            onChange={(e) =>
                              setCast((prev) =>
                                updateCastLookAt(prev, slot, e.target.checked),
                              )
                            }
                          />
                          Spiegeln (Sprechpartner anschauen)
                        </label>
                        <p className="muted story-card-subtitle">Asset: {member.assetName}</p>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setCast((prev) => ({ ...prev, [slot]: null }))}
                        >
                          Entfernen
                        </button>
                      </>
                    ) : (
                      <p className="muted">Noch leer — Figur unter «Bibliothek» wählen.</p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="story-generate-panel">
            <h3>Szenen-Presets & Ebenen</h3>
            <p className="muted">
              Presets legen <strong>einzelne Ebenen</strong> (Tisch, Stuhl, Teller …) über dein Umfeld.
              Ziel: jedes Teil einzeln tauschen/färben — KI-Umfelder sind heute noch ein flaches Bild.
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
                      onClick={() => {
                        setActivePresetId(preset.id)
                        setWorkflowStep('scene')
                      }}
                    >
                      Anwenden
                    </button>
                    {activePresetId === preset.id && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActivePresetId(null)}>
                        Entfernen
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {activePreset && (
              <div className="story-layer-panel">
                <h4 className="story-library-heading">Ebenen: {activePreset.name}</h4>
                <ul className="story-layer-list">
                  {activePreset.layers.map((layer) => {
                    const override = layerOverrides[layer.id] ?? { visible: true, hueRotate: 0 }
                    return (
                      <li key={layer.id} className="story-layer-row">
                        <label className="story-layer-visible">
                          <input
                            type="checkbox"
                            checked={override.visible}
                            onChange={(e) =>
                              setLayerOverrides((prev) => ({
                                ...prev,
                                [layer.id]: { ...override, visible: e.target.checked },
                              }))
                            }
                          />
                          {layer.name}
                        </label>
                        <label className="story-layer-hue">
                          Farbton
                          <input
                            type="range"
                            min={0}
                            max={360}
                            value={override.hueRotate}
                            onChange={(e) =>
                              setLayerOverrides((prev) => ({
                                ...prev,
                                [layer.id]: { ...override, hueRotate: Number(e.target.value) },
                              }))
                            }
                          />
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>

          <section className="story-generate-panel story-coming-soon">
            <h3>Aktionen (Schritt 3)</h3>
            <p className="muted">
              Sprechen, gehen, Mimik und Pose-Wechsel werden hier an die Besetzung gekoppelt — demnächst.
              Dialoge bearbeitest du schon heute unter{' '}
              <a href="/create">Dialog erstellen</a>.
            </p>
          </section>
        </>
      )}

      {activeTab === 'bibliothek' && (
        <>
          <section className="story-generate-panel story-sofa-cta">
            <h3>Dialog-Set (ganze Figur, mit Füßen)</h3>
            <p className="muted">
              Das findest du nicht in der Bibliothek selbst — es wird unter <strong>KI erzeugen</strong> gemacht.
              Danach erscheinen die 5 Posen hier und du speicherst sie.
            </p>
            <ol className="story-steps-list">
              <li>
                Oben auf <strong>KI erzeugen</strong> klicken (oder den Button unten)
              </li>
              <li>Julien oder Lucien wählen — sie sehen bewusst anders aus</li>
              <li>
                Grünen Button <strong>Ganze Figur erzeugen</strong> drücken (5 Bilder, inkl. Schuhe)
              </li>
              <li>
                Zurück hierher → <strong>Alle in Bibliothek</strong> → eine Pose «Als links»
              </li>
            </ol>
            <button type="button" className="btn btn-primary" onClick={goToSofaDialogSet}>
              Zur ganzen Figur →
            </button>
          </section>

          <section className="story-generate-panel" ref={sessionGalleryRef}>
            <h3>Gerade erzeugt (diese Sitzung)</h3>
            <p className="muted">
              <strong>Umgebung:</strong> «Hintergrund setzen» · <strong>Figur:</strong> «Als links» / «Als rechts»
            </p>
            {generatedCharacters.length === 0 && generatedEnvironments.length === 0 ? (
              <p className="muted">Noch nichts erzeugt. Tab «KI erzeugen» oder unten aus gespeicherter Bibliothek wählen.</p>
            ) : (
              <>
                {generatedCharacters.length > 0 && (
                  <>
                    <div className="story-library-heading-row">
                      <h4 className="story-library-heading">Figuren (Sitzung)</h4>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={savingId === 'session-chars-all'}
                        onClick={() => void handleSaveAllSessionCharacters()}
                      >
                        {savingId === 'session-chars-all'
                          ? 'Speichere …'
                          : `Alle ${generatedCharacters.length} in Bibliothek`}
                      </button>
                    </div>
                    <div className="story-character-grid">
                      {generatedCharacters.map((item, idx) => (
                        <StoryCharacterCard
                          key={`session-char-${item.imageUrl}`}
                          item={{
                            key: `session-char-${idx}`,
                            name: item.name,
                            imageUrl: item.imageUrl,
                            subtitle: [
                              'Gerade erzeugt',
                              poseVariantLabel(item.headAngle, item.legPose),
                              storyStyleLabel(item.styleId) ?? artStyle,
                            ]
                              .filter(Boolean)
                              .join(' · '),
                          }}
                          onPlaceLeft={() =>
                            handlePlaceCharacter('left', {
                              imageUrl: item.imageUrl,
                              assetName: item.name,
                              legPose: item.legPose,
                              headAngle: item.headAngle,
                            })
                          }
                          onPlaceRight={() =>
                            handlePlaceCharacter('right', {
                              imageUrl: item.imageUrl,
                              assetName: item.name,
                              legPose: item.legPose,
                              headAngle: item.headAngle,
                            })
                          }
                          onSave={() =>
                            void handleSaveToLibrary({
                              type: 'character',
                              name: characterBaseName(item.name),
                              description: item.description ?? characterDescription,
                              imageUrl: item.imageUrl,
                              styleId: item.styleId,
                              legPoseId: item.legPose,
                              headAngleId: item.headAngle,
                              key: `session-char-${idx}`,
                            })
                          }
                          saving={savingId === `session-char-${idx}`}
                        />
                      ))}
                    </div>
                  </>
                )}
                {generatedEnvironments.length > 0 && (
                  <>
                    <h4 className="story-library-heading">Umgebungen (Sitzung)</h4>
                    <div className="story-character-grid">
                      {generatedEnvironments.map((item, idx) => (
                        <StoryEnvironmentCard
                          key={`session-env-${item.imageUrl}`}
                          item={{
                            key: `session-env-${idx}`,
                            name: item.name,
                            imageUrl: item.imageUrl,
                            tags: item.styleId ? [storyStyleLabel(item.styleId)!] : undefined,
                          }}
                          isActive={activeEnvironmentUrl === item.imageUrl}
                          onUse={() => handleApplyBackground(item.name, item.imageUrl)}
                          onSave={() =>
                            void handleSaveToLibrary({
                              type: 'environment',
                              name: item.name,
                              description: environmentDescription,
                              imageUrl: item.imageUrl,
                              styleId: item.styleId,
                              key: `session-env-${idx}`,
                            })
                          }
                          saving={savingId === `session-env-${idx}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          <section className="story-generate-panel">
            <h3>Gespeicherte Bibliothek</h3>
            <p className="muted">
              Dauerhaft gespeichert — Tags zum Filtern. Wiederverwendung ohne neue KI-Generierung.
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
                        <StoryEnvironmentCard
                          key={item.id}
                          item={{
                            key: item.id,
                            name: item.name,
                            imageUrl: item.imageUrl,
                            tags: [
                              ...item.tags,
                              ...(item.styleId && storyStyleLabel(item.styleId)
                                ? [storyStyleLabel(item.styleId)!]
                                : []),
                            ],
                          }}
                          isActive={activeEnvironmentUrl === item.imageUrl}
                          onUse={() => handleApplyBackground(item.name, item.imageUrl)}
                          onDelete={() => void handleDeleteFromLibrary(item.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {libraryCharacters.length > 0 && (
                  <>
                    <h4 className="story-library-heading">Figuren</h4>
                    <div className="story-character-grid">
                      {libraryCharacters.map((item) => (
                        <StoryCharacterCard
                          key={item.id}
                          item={{
                            key: item.id,
                            name: item.name,
                            imageUrl: item.imageUrl,
                            tags: [
                              ...item.tags,
                              ...(item.styleId && storyStyleLabel(item.styleId)
                                ? [storyStyleLabel(item.styleId)!]
                                : []),
                              ...(item.headAngleId && isHeadAngleId(item.headAngleId)
                                ? [headAngleLabel(item.headAngleId)]
                                : []),
                              ...(item.legPoseId && isLegPoseId(item.legPoseId)
                                ? [legPoseLabel(item.legPoseId)]
                                : []),
                            ],
                          }}
                          onPlaceLeft={() =>
                            handlePlaceCharacter('left', {
                              imageUrl: item.imageUrl,
                              assetName: item.name,
                              libraryAssetId: item.id,
                              legPose: item.legPoseId as LegPoseId | undefined,
                              headAngle: item.headAngleId as HeadAngleId | undefined,
                            })
                          }
                          onPlaceRight={() =>
                            handlePlaceCharacter('right', {
                              imageUrl: item.imageUrl,
                              assetName: item.name,
                              libraryAssetId: item.id,
                              legPose: item.legPoseId as LegPoseId | undefined,
                              headAngle: item.headAngleId as HeadAngleId | undefined,
                            })
                          }
                          onDelete={() => void handleDeleteFromLibrary(item.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {libraryAssets.length === 0 && generatedCharacters.length === 0 && (
                  <p className="muted">Bibliothek leer — unter «KI erzeugen» etwas erstellen und «In Bibliothek» speichern.</p>
                )}
              </>
            )}
          </section>
        </>
      )}

      {activeTab === 'erzeugen' && (
        <>
          <section className="story-generate-panel story-sofa-cta" id="sofa-dialog-set">
            <h3>1 — Ganze Figur erzeugen</h3>
            <p className="muted">
              Erzeugt <strong>5 stehende Varianten</strong> mit verschiedenen Blickrichtungen —{' '}
              <strong>Kopf bis Schuhe</strong> im Bild. Julien und Lucien bekommen automatisch unterschiedliche Looks.
              Bildstil muss «Lebendige Illustration» sein.
            </p>
            <div className="story-character-form">
              <div className="story-look-picks" role="group" aria-label="Figuren-Looks">
                {STORY_CHARACTER_LOOKS.map((look) => (
                  <button
                    key={look.name}
                    type="button"
                    className={`story-look-pick${
                      normalizeCharacterLookName(characterName) === normalizeCharacterLookName(look.name)
                        ? ' is-active'
                        : ''
                    }`}
                    disabled={generatingCharacter || generatingPoseBatch}
                    onClick={() => {
                      setCharacterName(look.name)
                      setCharacterDescription(look.description)
                    }}
                  >
                    {look.name}
                  </button>
                ))}
              </div>
              {activeLook && (
                <p className="muted story-look-hint">{activeLook.hintDe}</p>
              )}
              <input
                type="text"
                className="input"
                placeholder="Figurenname (z.B. Julien)"
                value={characterName}
                onChange={(e) => applyCharacterName(e.target.value)}
                disabled={generatingCharacter || generatingPoseBatch}
              />
              <textarea
                className="input"
                rows={3}
                placeholder="Beschreibung (Alter, Haare, Kleidung, Ausdruck...)"
                value={characterDescription}
                onChange={(e) => setCharacterDescription(e.target.value)}
                disabled={generatingCharacter || generatingPoseBatch}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={generatingCharacter || generatingPoseBatch || !characterName.trim() || !characterDescription.trim()}
                onClick={() => {
                  setGenerateLegPose('standing')
                  void handleGeneratePoseBatch('sofa-dialogue')
                }}
              >
                {generatingPoseBatch && generatePoseSet === 'sofa-dialogue'
                  ? `Erzeuge Figuren … ${poseBatchProgress}`
                  : 'Ganze Figur erzeugen (5 Bilder, mit Füßen)'}
              </button>
            </div>
            {characterError && <p className="alert alert-error">{characterError}</p>}
            {generatingPoseBatch && (
              <p className="muted">Dauert ein paar Minuten — bitte Fenster offen lassen.</p>
            )}
          </section>

          <section className="story-generate-panel">
            <h3>2 — Einzelne Pose oder anderes Set</h3>
            <p className="muted">Nur nötig, wenn du etwas anderes als das Sofa-Set willst.</p>
            <div className="story-character-form">
              <div className="story-pose-pickers">
                <label className="story-cast-name-label">
                  Kopf-Richtung
                  <select
                    className="input"
                    value={generateHeadAngle}
                    onChange={(e) => setGenerateHeadAngle(e.target.value as HeadAngleId)}
                    disabled={generatingCharacter || generatingPoseBatch}
                  >
                    {HEAD_ANGLES.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="story-cast-name-label">
                  Bein-Pose
                  <select
                    className="input"
                    value={generateLegPose}
                    onChange={(e) => setGenerateLegPose(e.target.value as LegPoseId)}
                    disabled={generatingCharacter || generatingPoseBatch}
                  >
                    {LEG_POSES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={generatingCharacter || generatingPoseBatch}
                onClick={handleGenerateCharacter}
              >
                {generatingCharacter ? 'Erzeuge Figur …' : 'Nur eine Pose erzeugen'}
              </button>
              <label className="story-cast-name-label">
                Anderes Pose-Set
                <select
                  className="input"
                  value={generatePoseSet}
                  onChange={(e) => setGeneratePoseSet(e.target.value as PoseSetId)}
                  disabled={generatingCharacter || generatingPoseBatch}
                >
                  {POSE_SETS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({poseSetCount(s.id)} Bilder)
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted story-card-subtitle">
                {POSE_SETS.find((s) => s.id === generatePoseSet)?.description}
                {generatePoseSet === 'heads-for-leg'
                  ? ` — Bein-Pose: ${legPoseLabel(generateLegPose)}`
                  : ''}
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={generatingCharacter || generatingPoseBatch}
                onClick={() => void handleGeneratePoseBatch()}
              >
                {generatingPoseBatch
                  ? `Erzeuge Set … ${poseBatchProgress}`
                  : `${POSE_SETS.find((s) => s.id === generatePoseSet)?.label ?? 'Set'} erzeugen`}
              </button>
            </div>
          </section>

          <section className="story-generate-panel">
            <h3>Pose-Übersicht</h3>
            <p className="muted">
              Nach dem Sofa-Set: unter <strong>Bibliothek</strong> speichern, eine Pose platzieren, dann in der
              Besetzung die Blickrichtung umschalten.
            </p>
            <p className="muted">
              Volle Matrix: {poseMatrixSize().heads} × {poseMatrixSize().legs} = {poseMatrixSize().total} (nur wenn
              wirklich nötig).
            </p>
            <div className="story-pose-grid">
              <div>
                <h4 className="story-library-heading">Kopf-Richtungen</h4>
                <ul className="story-pose-list">
                  {HEAD_ANGLES.map((h) => (
                    <li key={h.id}>{h.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="story-library-heading">Bein-Posen</h4>
                <ul className="story-pose-list">
                  {LEG_POSES.map((l) => (
                    <li key={l.id}>{l.label}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="story-generate-panel">
            <h3>KI-Umfeld generieren</h3>
            <p className="muted">
              Flacher Hintergrund — ergänze Presets (Tab Szene) für einzelne Möbel-Ebenen.
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
          </section>

          <section className="story-generate-panel">
            <h3>KI-Szene generieren (ganzes Bild)</h3>
            <p className="muted">Ein flaches Gesamtbild — für maximale Flexibilität lieber Umfeld + Preset-Ebenen.</p>
            <div className="story-generate-row">
              <input
                type="text"
                className="input"
                placeholder="z.B. Wohnzimmer mit Sofa, Couchtisch, Vater am Esstisch"
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
                    const result = await api.story.generateScene(desc, artStyle)
                    setGeneratedImage(result.imageUrl)
                    setGeneratedSceneStyleId(result.styleId as StoryArtStyleId)
                    handleApplyBackground('Generierte Szene', result.imageUrl)
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
                {generatedSceneStyleId && (
                  <p className="muted story-card-subtitle">
                    Stil: {storyStyleLabel(generatedSceneStyleId)}
                  </p>
                )}
                <div className="story-character-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleApplyBackground('Generierte Szene', generatedImage)}
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
                        styleId: generatedSceneStyleId ?? artStyle,
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
        </>
      )}
    </div>
  )
}
