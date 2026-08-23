import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CompositeCanvas, type LayerImage, type LayerAnimation } from './CompositeCanvas'
import { api } from '../api/client'
import type { StoryLibraryAsset } from '../../shared/story-types'
import type { ScenePreset } from '../../shared/scene-presets'
import { SCENE_PRESETS } from '../../shared/scene-presets'
import { StoryWorkflowNav, type StoryWorkflowStep } from './StoryWorkflowNav'
import {
  addCastMember,
  CAST_MAX,
  EMPTY_CAST,
  removeCastMember,
  getCastMember,
  updateCastName,
  updateCastPose,
  updateCastLookAt,
  updateCastTransform,
  nudgeCastTransform,
  swapCastVariant,
  mixCastHead,
  mixCastLegs,
  mixCastTorso,
  applyGeneratedPose,
  updateCastHeadTwist,
  type MixedCastPart,
  applyCastRig,
  castLayerId,
  memberIdFromLayerId,
  type SceneCast,
  type CastPose,
} from './story-cast'
import {
  ARM_POSES,
  HEAD_ANGLES,
  LEG_POSES,
  POSE_SETS,
  characterBaseName,
  armPoseLabel,
  legPoseLabel,
  poseMatrixSize,
  poseSetCombos,
  poseSetCount,
  poseVariantLabel,
  type ArmPoseId,
  type HeadAngleId,
  type LegPoseId,
  type PoseSetId,
} from '../../shared/character-parts'
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
import { StorySceneDock, type EnvironmentPick } from './StorySceneDock'
import { listCharacterIdentities, pickIdentityReference, type PoseVariant } from './pose-variants'
import { getCastRenderLayers, bobLayerIds } from './cast-puppet'
import { isCharacterRig, type CharacterRig } from '../../shared/character-rig'

type StoryTab = 'szene' | 'bibliothek' | 'erzeugen'

type LayerOverride = { visible: boolean; hueRotate: number }

type SessionCharacter = {
  name: string
  imageUrl: string
  description?: string
  styleId: StoryArtStyleId
  legPose?: LegPoseId
  headAngle?: HeadAngleId
  armPose?: ArmPoseId
  rig?: CharacterRig
}
type SessionEnvironment = {
  name: string
  imageUrl: string
  styleId: StoryArtStyleId
}

const CANVAS_W = 1280
const CANVAS_H = 720

function mixedPartNotice(part: MixedCastPart): string {
  if (part === 'head') return 'Kopf aufgesetzt — Rumpf und Beine bleiben.'
  if (part === 'legs') return 'Beine aufgesetzt — Kopf und Rumpf bleiben.'
  return 'Arme aufgesetzt — Kopf und Beine bleiben.'
}

function generatedPoseNotice(
  name: string,
  mixed: MixedCastPart | null,
  hasRig: boolean,
  label: string,
): string {
  if (mixed === 'head') return `${name}: Kopf gezeichnet und aufgesetzt — Rumpf und Beine bleiben.`
  if (mixed === 'legs') return `${name}: Beine gezeichnet und aufgesetzt — Kopf und Rumpf bleiben.`
  if (mixed === 'torso') return `${name}: Arme gezeichnet und aufgesetzt — Kopf und Beine bleiben.`
  if (hasRig) return `${name}: ${label} erzeugt — Skelett aktiv.`
  return `${name}: ${label} erzeugt.`
}

const PARK_BACKGROUND: EnvironmentPick = {
  key: 'park-demo',
  name: 'Park',
  imageUrl: '/assets/environments/park/background.svg',
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
  const [cast, setCast] = useState<SceneCast>(EMPTY_CAST)
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generateLegPose, setGenerateLegPose] = useState<LegPoseId>('standing')
  const [generateHeadAngle, setGenerateHeadAngle] = useState<HeadAngleId>('front')
  const [generateArmPose, setGenerateArmPose] = useState<ArmPoseId>('relaxed')
  const [generatePoseSet, setGeneratePoseSet] = useState<PoseSetId>('sofa-dialogue')
  const [generatingPoseBatch, setGeneratingPoseBatch] = useState(false)
  const [poseBatchProgress, setPoseBatchProgress] = useState('')
  const [generatingDockPose, setGeneratingDockPose] = useState(false)
  const [buildingRig, setBuildingRig] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [presets] = useState<ScenePreset[]>(SCENE_PRESETS)

  const activePreset = useMemo(
    () => presets.find((p) => p.id === activePresetId) ?? null,
    [presets, activePresetId],
  )

  const handleApplyBackground = (name: string, imageUrl: string) => {
    setActiveEnvironmentUrl(imageUrl)
    setActiveEnvironmentName(name)
    setActiveTab('szene')
    setWorkflowStep('scene')
    setSceneNotice(`Hintergrund «${name}» ist gesetzt — rechts eine Figur wählen.`)
  }

  const activeSceneTitle =
    activeEnvironmentName ??
    (activeEnvironmentUrl ? 'Eigenes Umfeld' : 'Kein Hintergrund')

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

  const handlePlaceCharacter = (input: {
      imageUrl: string
      assetName: string
      libraryAssetId?: string
      displayName?: string
      pose?: CastPose
      legPose?: LegPoseId
      headAngle?: HeadAngleId
      armPose?: ArmPoseId
      rig?: CharacterRig
    }) => {
    const sitting = input.legPose?.startsWith('sitting')
    setCast((prev) => {
      const { cast: next, id } = addCastMember(prev, {
        ...input,
        pose: input.pose ?? (sitting ? 'sitting-sofa' : 'standing'),
      })
      if (!id) {
        setSceneNotice(`Höchstens ${CAST_MAX} Figuren in einer Szene.`)
        return prev
      }
      setSelectedId(id)
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
  const sessionIdentities = useMemo(
    () => listCharacterIdentities([], generatedCharacters),
    [generatedCharacters],
  )
  const libraryIdentities = useMemo(
    () => listCharacterIdentities(libraryCharacters, []),
    [libraryCharacters],
  )

  const dockEnvironments = useMemo<EnvironmentPick[]>(() => {
    const items: EnvironmentPick[] = [PARK_BACKGROUND]
    for (const env of generatedEnvironments) {
      if (!items.some((i) => i.imageUrl === env.imageUrl)) {
        items.push({ key: `session-${env.imageUrl}`, name: env.name, imageUrl: env.imageUrl })
      }
    }
    for (const env of libraryEnvironments) {
      if (!items.some((i) => i.imageUrl === env.imageUrl)) {
        items.push({ key: env.id, name: env.name, imageUrl: env.imageUrl })
      }
    }
    return items
  }, [generatedEnvironments, libraryEnvironments])

  const handleSaveToLibrary = async (input: {
    type: 'character' | 'environment' | 'scene'
    name: string
    description?: string
    imageUrl: string
    styleId?: StoryArtStyleId
    legPoseId?: LegPoseId
    headAngleId?: HeadAngleId
    armPoseId?: ArmPoseId
    rig?: CharacterRig
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
        armPoseId: input.armPoseId,
        rig: input.rig,
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

  const handleDeleteCharacterIdentity = async (libraryIds: string[]) => {
    for (const id of libraryIds) {
      await handleDeleteFromLibrary(id)
    }
  }

  const handleSaveCharacterIdentity = async (baseName: string) => {
    const items = generatedCharacters.filter(
      (c) => characterBaseName(c.name).toLowerCase() === baseName.toLowerCase(),
    )
    if (items.length === 0) return
    setSavingId(`identity-${baseName}`)
    try {
      for (const item of items) {
        const { asset } = await api.story.saveToLibrary({
          type: 'character',
          name: characterBaseName(item.name),
          description: item.description,
          imageUrl: item.imageUrl,
          tags: [
            ...parseTagsInput(saveTagsInput),
            ...(item.headAngle ? [item.headAngle] : []),
            ...(item.legPose ? [item.legPose] : []),
            ...(item.armPose && item.armPose !== 'relaxed' ? [item.armPose] : []),
          ],
          styleId: item.styleId ?? artStyle,
          legPoseId: item.legPose,
          headAngleId: item.headAngle,
          armPoseId: item.armPose,
          rig: item.rig,
        })
        setLibraryAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)])
      }
      setSceneNotice(`«${baseName}» mit ${items.length} Einstellung(en) gespeichert.`)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSavingId(null)
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
            ...(item.armPose && item.armPose !== 'relaxed' ? [item.armPose] : []),
          ],
          styleId: item.styleId ?? artStyle,
          legPoseId: item.legPose,
          headAngleId: item.headAngle,
          armPoseId: item.armPose,
          rig: item.rig,
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

  const layers = useMemo<LayerImage[]>(() => {
    const result: LayerImage[] = []

    if (activeEnvironmentUrl) {
      result.push({
        id: 'bg',
        src: activeEnvironmentUrl,
        x: 0,
        y: 0,
        width: CANVAS_W,
        height: CANVAS_H,
        zIndex: 0,
      })
    }

    result.push(...presetLayersToCanvas(activePreset, CANVAS_W, CANVAS_H, layerOverrides))

    for (const member of cast.members) {
      result.push(...getCastRenderLayers(member, CANVAS_W, CANVAS_H, cast.members))
    }

    return result
  }, [activeEnvironmentUrl, activePreset, layerOverrides, cast])

  const sceneAnimations = useMemo<LayerAnimation[]>(() => {
    const anims: LayerAnimation[] = []
    cast.members.forEach((member, index) => {
      for (const layerId of bobLayerIds(member)) {
        anims.push({
          layerId,
          type: 'bob',
          amplitude: index % 2 === 0 ? 1.2 : 1.1,
          period: 4300 + index * 220,
        })
      }
    })
    return anims
  }, [cast.members])

  const appearanceForName = (name: string): string => {
    const key = characterBaseName(name).toLowerCase()
    const fromSession = generatedCharacters.find(
      (c) => characterBaseName(c.name).toLowerCase() === key && c.description,
    )
    if (fromSession?.description) return fromSession.description
    const fromLib = libraryCharacters.find(
      (c) => characterBaseName(c.name).toLowerCase() === key && c.description,
    )
    if (fromLib?.description) return fromLib.description
    return descriptionForCharacterName(name) ?? characterDescription.trim()
  }

  const handleGenerateDockPose = async (
    id: string,
    head: HeadAngleId,
    leg: LegPoseId,
    arm: ArmPoseId,
  ) => {
    const member = getCastMember(cast, id)
    if (!member) return
    const name = characterBaseName(member.displayName || member.assetName)
    const description = appearanceForName(name)
    if (!name || !description) return
    setGeneratingDockPose(true)
    setCharacterError('')
    setPoseBatchProgress(`${poseVariantLabel(head, leg, arm)} …`)
    try {
      const refUrl = pickIdentityReference(name, libraryCharacters, generatedCharacters) ?? member.imageUrl
      const result = await api.story.generateCharacter(
        name,
        description,
        artStyle,
        leg,
        head,
        arm,
        refUrl,
      )
      const created: SessionCharacter = {
        name: `${name} · ${poseVariantLabel(head, leg, arm)}`,
        imageUrl: result.imageUrl,
        description,
        styleId: result.styleId as StoryArtStyleId,
        legPose: leg,
        headAngle: head,
        armPose: arm,
        rig: result.rig,
      }
      setGeneratedCharacters((prev) => [created, ...prev].slice(0, 56))
      const generated = {
        imageUrl: result.imageUrl,
        assetName: created.name,
        headAngle: head,
        legPose: leg,
        armPose: arm,
        rig: result.rig,
      }
      let mixed: MixedCastPart | null = null
      setCast((prev) => {
        const applied = applyGeneratedPose(prev, id, generated)
        mixed = applied.mixed
        return applied.cast
      })
      setSceneNotice(generatedPoseNotice(name, mixed, Boolean(result.rig), poseVariantLabel(head, leg, arm)))
    } catch (err) {
      setCharacterError(err instanceof Error ? err.message : 'Pose konnte nicht erzeugt werden.')
    } finally {
      setGeneratingDockPose(false)
      setPoseBatchProgress('')
    }
  }

  const handleBuildRig = async (id: string) => {
    const member = getCastMember(cast, id)
    if (!member) return
    setBuildingRig(true)
    setCharacterError('')
    try {
      const result = await api.story.rigCharacter(
        member.imageUrl,
        characterBaseName(member.displayName || member.assetName),
        member.libraryAssetId,
      )
      if (!isCharacterRig(result.rig)) {
        setCharacterError(
          'Zerlegen hat keine Teile geliefert. Bitte eine Ganzkörperfigur nehmen, Arme leicht vom Rumpf weg.',
        )
        return
      }
      setCast((prev) => applyCastRig(prev, id, result.rig, result.imageUrl))
      setGeneratedCharacters((prev) =>
        prev.map((item) =>
          item.imageUrl === member.imageUrl
            ? { ...item, rig: result.rig, imageUrl: result.imageUrl || item.imageUrl }
            : item,
        ),
      )
      if (result.asset) {
        setLibraryAssets((prev) => prev.map((a) => (a.id === result.asset!.id ? result.asset! : a)))
      }
      setSceneNotice('Zerlegt. Grünes Feld «Skelett aktiv» — dort den Kopf drehen.')
    } catch (err) {
      setCharacterError(err instanceof Error ? err.message : 'Zerlegen fehlgeschlagen.')
    } finally {
      setBuildingRig(false)
    }
  }

  const applyCharacterName = (nextName: string) => {
    setCharacterName(nextName)
    if (isKnownLookDescription(characterDescription)) {
      const nextDesc = descriptionForCharacterName(nextName)
      if (nextDesc) setCharacterDescription(nextDesc)
    }
  }

  const handleGenerateCharacter = async (pose?: {
    leg: LegPoseId
    head: HeadAngleId
    arm: ArmPoseId
  }) => {
    const name = characterName.trim()
    const description = characterDescription.trim()
    if (!name || !description) return
    const leg = pose?.leg ?? generateLegPose
    const head = pose?.head ?? generateHeadAngle
    const arm = pose?.arm ?? generateArmPose
    setGeneratingCharacter(true)
    setCharacterError('')
    try {
      const refUrl = pickIdentityReference(name, libraryCharacters, generatedCharacters)
      const result = await api.story.generateCharacter(
        name,
        description,
        artStyle,
        leg,
        head,
        arm,
        refUrl,
      )
      setGeneratedCharacters((prev) =>
        [
          {
            name,
            imageUrl: result.imageUrl,
            description,
            styleId: result.styleId as StoryArtStyleId,
            legPose: leg,
            headAngle: head,
            armPose: arm,
            rig: result.rig,
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
    const combos = poseSetCombos(setId, generateLegPose, generateArmPose)
    if (combos.length === 0) return
    setGeneratePoseSet(setId)
    setGeneratingPoseBatch(true)
    setCharacterError('')
    setPoseBatchProgress(`0 / ${combos.length}`)
    const created: SessionCharacter[] = []
    let refUrl = pickIdentityReference(name, libraryCharacters, generatedCharacters)
    try {
      for (let i = 0; i < combos.length; i++) {
        const { head, leg, arm } = combos[i]
        setPoseBatchProgress(`${i + 1} / ${combos.length} · ${poseVariantLabel(head, leg, arm)}`)
        const result = await api.story.generateCharacter(
          name,
          description,
          artStyle,
          leg,
          head,
          arm,
          refUrl,
        )
        if (!refUrl) refUrl = result.imageUrl
        created.push({
          name: `${name} · ${poseVariantLabel(head, leg, arm)}`,
          imageUrl: result.imageUrl,
          description,
          styleId: result.styleId as StoryArtStyleId,
          legPose: leg,
          headAngle: head,
          armPose: arm,
          rig: result.rig,
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
          Bild wählen, Figur ins Bild setzen, anklicken — sitzen, schauen, zoomen siehst du sofort.
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

      {activeTab === 'szene' && (
        <>
          <div className="story-stage">
            <div
              className="story-canvas-wrapper"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                const raw = e.dataTransfer.getData('application/json')
                if (!raw) return
                try {
                  const parsed = JSON.parse(raw) as { kind?: string; variant?: PoseVariant }
                  if (parsed.kind !== 'zebla-character' || !parsed.variant) return
                  handlePlaceCharacter({
                    imageUrl: parsed.variant.imageUrl,
                    assetName: parsed.variant.assetName,
                    libraryAssetId: parsed.variant.libraryAssetId,
                    legPose: parsed.variant.legPose,
                    headAngle: parsed.variant.headAngle,
                    armPose: parsed.variant.armPose,
                    rig: parsed.variant.rig,
                  })
                } catch {
                  /* ignore */
                }
              }}
            >
              <CompositeCanvas
                width={CANVAS_W}
                height={CANVAS_H}
                layers={layers}
                animations={sceneAnimations}
                className="story-canvas"
                selectedLayerId={selectedId ? castLayerId(selectedId) : null}
                onSelectLayer={(id) => setSelectedId(memberIdFromLayerId(id))}
                onDragLayer={(layerId, dx, dy) => {
                  const id = memberIdFromLayerId(layerId)
                  if (!id) return
                  setCast((prev) => nudgeCastTransform(prev, id, dx, dy))
                }}
                onWheelLayer={(layerId, deltaScale) => {
                  const id = memberIdFromLayerId(layerId)
                  if (!id) return
                  setCast((prev) => {
                    const member = getCastMember(prev, id)
                    if (!member) return prev
                    const nextScale = Math.min(1.8, Math.max(0.4, member.transform.scale + deltaScale))
                    return updateCastTransform(prev, id, { scale: nextScale })
                  })
                }}
                onRotateLayer={(layerId, deltaRotation) => {
                  const id = memberIdFromLayerId(layerId)
                  if (!id) return
                  setCast((prev) => {
                    const member = getCastMember(prev, id)
                    if (!member) return prev
                    return updateCastTransform(prev, id, {
                      rotation: Math.max(-90, Math.min(90, member.transform.rotation + deltaRotation)),
                    })
                  })
                }}
                onStretchLayer={(layerId, dScaleX, dScaleY) => {
                  const id = memberIdFromLayerId(layerId)
                  if (!id) return
                  setCast((prev) => {
                    const member = getCastMember(prev, id)
                    if (!member) return prev
                    return updateCastTransform(prev, id, {
                      scaleX: Math.min(1.5, Math.max(0.5, (member.transform.scaleX || 1) + dScaleX)),
                      scaleY: Math.min(1.5, Math.max(0.5, (member.transform.scaleY || 1) + dScaleY)),
                    })
                  })
                }}
              />
              {!activeEnvironmentUrl && cast.members.length === 0 && (
                <p className="story-canvas-empty">Rechts einen Hintergrund wählen</p>
              )}
            </div>
            <StorySceneDock
              environments={dockEnvironments}
              activeEnvironmentUrl={activeEnvironmentUrl}
              onPickEnvironment={handleApplyBackground}
              libraryCharacters={libraryCharacters}
              sessionCharacters={generatedCharacters}
              cast={cast}
              selectedId={selectedId}
              onSelectMember={(id) => setSelectedId(id)}
              onPlaceCharacter={(variant) =>
                handlePlaceCharacter({
                  imageUrl: variant.imageUrl,
                  assetName: variant.assetName,
                  libraryAssetId: variant.libraryAssetId,
                  legPose: variant.legPose,
                  headAngle: variant.headAngle,
                  armPose: variant.armPose,
                  rig: variant.rig,
                })
              }
              onRemoveMember={(id) => {
                setCast((prev) => removeCastMember(prev, id))
                setSelectedId((prev) => (prev === id ? null : prev))
              }}
              onSwapVariant={(id, variant) => {
                setCast((prev) =>
                  swapCastVariant(prev, id, {
                    imageUrl: variant.imageUrl,
                    assetName: variant.assetName,
                    libraryAssetId: variant.libraryAssetId,
                    headAngle: variant.headAngle,
                    legPose: variant.legPose,
                    armPose: variant.armPose,
                    rig: variant.rig,
                  }),
                )
              }}
              onMixPart={(id, part, donor) => {
                setCast((prev) => {
                  if (part === 'head') return mixCastHead(prev, id, donor)
                  if (part === 'legs') return mixCastLegs(prev, id, donor)
                  return mixCastTorso(prev, id, donor)
                })
                setSceneNotice(mixedPartNotice(part))
              }}
              onHeadTwist={(id, deg) => setCast((prev) => updateCastHeadTwist(prev, id, deg))}
              onBuildRig={(id) => void handleBuildRig(id)}
              onSetPose={(id, pose) => setCast((prev) => updateCastPose(prev, id, pose))}
              onLookAt={(id, look) => setCast((prev) => updateCastLookAt(prev, id, look))}
              onResetTransform={(id) =>
                setCast((prev) => {
                  const member = getCastMember(prev, id)
                  if (!member) return prev
                  return updateCastPose(prev, id, member.pose === 'custom' ? 'standing' : member.pose)
                })
              }
              onRename={(id, name) => setCast((prev) => updateCastName(prev, id, name))}
              onGeneratePose={(id, head, leg, arm) =>
                void handleGenerateDockPose(id, head, leg, arm)
              }
              generatingPose={generatingDockPose}
              buildingRig={buildingRig}
              generatePoseLabel={poseBatchProgress || 'Erzeuge Pose …'}
              dockError={characterError}
              presets={presets}
              activePresetId={activePresetId}
              onApplyPreset={setActivePresetId}
            />
          </div>
          {sceneNotice && <p className="alert alert-success story-notice">{sceneNotice}</p>}
          {characterError && activeTab === 'szene' && (
            <p className="alert alert-error">{characterError}</p>
          )}
          <p className="story-scene-info">
            {activeSceneTitle}
            {cast.members.length > 0
              ? ` · ${cast.members.map((m) => m.displayName).join(' & ')}`
              : ''}
          </p>
        </>
      )}


      {activeTab === 'bibliothek' && (
        <>
          <section className="story-generate-panel story-sofa-cta">
            <h3>Eine Figur, dann einstellen</h3>
            <p className="muted">
              Julien einmal erzeugen. Danach in der Szene: Kopf am Hals drehen, oder in Kopf/Rumpf/Beine zerlegen. Nicht fünf Karten sammeln.
            </p>
            <button type="button" className="btn btn-primary" onClick={goToSofaDialogSet}>
              Figur erzeugen →
            </button>
          </section>

          <section className="story-generate-panel" ref={sessionGalleryRef}>
            <h3>Gerade erzeugt (diese Sitzung)</h3>
            <p className="muted">
              <strong>Umgebung:</strong> «Hintergrund setzen» · <strong>Figur:</strong> «Ins Bild» (auch mehrmals denselben)
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
                      {sessionIdentities.map((identity) => (
                        <StoryCharacterCard
                          key={`session-char-${identity.baseName}`}
                          item={{
                            key: `session-char-${identity.baseName}`,
                            name: identity.baseName,
                            imageUrl: identity.preview.imageUrl,
                            subtitle: [
                              'Gerade erzeugt',
                              identity.preview.rig ? 'Skelett' : null,
                              identity.variantCount > 1
                                ? `${identity.variantCount} Einstellungen`
                                : poseVariantLabel(
                                    identity.preview.headAngle,
                                    identity.preview.legPose,
                                    identity.preview.armPose,
                                  ),
                              storyStyleLabel(artStyle),
                            ]
                              .filter(Boolean)
                              .join(' · '),
                          }}
                          onPlace={() =>
                            handlePlaceCharacter({
                              imageUrl: identity.preview.imageUrl,
                              assetName: identity.preview.assetName,
                              legPose: identity.preview.legPose,
                              headAngle: identity.preview.headAngle,
                              armPose: identity.preview.armPose,
                              rig: identity.preview.rig,
                            })
                          }
                          onSave={() => void handleSaveCharacterIdentity(identity.baseName)}
                          saving={savingId === `identity-${identity.baseName}`}
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
                {libraryIdentities.length > 0 && (
                  <>
                    <h4 className="story-library-heading">Figuren</h4>
                    <p className="muted">Eine Karte pro Person. Posen stellst du in der Szene ein.</p>
                    <div className="story-character-grid">
                      {libraryIdentities.map((identity) => (
                        <StoryCharacterCard
                          key={identity.baseName}
                          item={{
                            key: identity.baseName,
                            name: identity.baseName,
                            imageUrl: identity.preview.imageUrl,
                            tags: [
                              identity.preview.rig ? 'Skelett' : '',
                              identity.variantCount > 1
                                ? `${identity.variantCount} Einstellungen`
                                : poseVariantLabel(
                                    identity.preview.headAngle,
                                    identity.preview.legPose,
                                    identity.preview.armPose,
                                  ),
                            ].filter(Boolean),
                          }}
                          onPlace={() =>
                            handlePlaceCharacter({
                              imageUrl: identity.preview.imageUrl,
                              assetName: identity.preview.assetName,
                              libraryAssetId: identity.preview.libraryAssetId,
                              legPose: identity.preview.legPose,
                              headAngle: identity.preview.headAngle,
                              armPose: identity.preview.armPose,
                              rig: identity.preview.rig,
                            })
                          }
                          onDelete={
                            identity.libraryIds.length > 0
                              ? () => void handleDeleteCharacterIdentity(identity.libraryIds)
                              : undefined
                          }
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
            <h3>1 — Eine Figur erzeugen</h3>
            <p className="muted">
              Ein Bild: <strong>Kopf bis Schuhe</strong>. Danach in der Szene sitzen, Hüfte und Kopf einstellen.
              Julien, Lucien, Guillaume usw. bekommen feste Looks.
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
                  void handleGenerateCharacter({
                    leg: 'standing',
                    head: 'front',
                    arm: 'relaxed',
                  })
                }}
              >
                {generatingCharacter ? 'Erzeuge Figur …' : 'Figur erzeugen (ein Bild, mit Füßen)'}
              </button>
            </div>
            {characterError && <p className="alert alert-error">{characterError}</p>}
            {generatingPoseBatch && (
              <p className="muted">Dauert ein paar Minuten — bitte Fenster offen lassen.</p>
            )}
          </section>

          <section className="story-generate-panel">
            <h3>2 — Extra-Pose (nur wenn nötig)</h3>
            <p className="muted">
              Normalerweise reicht die Szene rechts: Kopf / Beine / Arme. Hier nur, wenn du absichtlich ein zweites Bild vorab willst.
            </p>
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
                <label className="story-cast-name-label">
                  Arme
                  <select
                    className="input"
                    value={generateArmPose}
                    onChange={(e) => setGenerateArmPose(e.target.value as ArmPoseId)}
                    disabled={generatingCharacter || generatingPoseBatch}
                  >
                    {ARM_POSES.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={generatingCharacter || generatingPoseBatch}
                onClick={() => void handleGenerateCharacter()}
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
                  ? ` — Beine: ${legPoseLabel(generateLegPose)} · Arme: ${armPoseLabel(generateArmPose)}`
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
              Nach dem Sofa-Set: unter <strong>Bibliothek</strong> speichern, eine Pose platzieren, dann rechts
              Kopf, Beine und Arme umschalten. Fehlt eine Kombination, erzeugt «+» sie.
            </p>
            <p className="muted">
              Volle Matrix: {poseMatrixSize().heads} × {poseMatrixSize().legs} × {poseMatrixSize().arms} ={' '}
              {poseMatrixSize().total} Bilder — nicht auf einmal erzeugen, nur per Button was du brauchst.
            </p>
            <div className="story-pose-grid">
              <div>
                <h4 className="story-library-heading">Kopf</h4>
                <ul className="story-pose-list">
                  {HEAD_ANGLES.map((h) => (
                    <li key={h.id}>{h.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="story-library-heading">Beine</h4>
                <ul className="story-pose-list">
                  {LEG_POSES.map((l) => (
                    <li key={l.id}>{l.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="story-library-heading">Arme</h4>
                <ul className="story-pose-list">
                  {ARM_POSES.map((a) => (
                    <li key={a.id}>{a.label}</li>
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
