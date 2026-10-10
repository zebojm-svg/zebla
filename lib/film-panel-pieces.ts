/**
 * Fehlende Räume und Figuren einzeln erzeugen — nicht als Gruppenbild.
 */

import { characterBaseName } from '../shared/character-parts.js'
import {
  characterPieceTags,
  environmentPieceTags,
  isHarvestedFromStill,
  libraryForCompose,
  shouldSkipBackground,
  shouldSkipCharacterPose,
} from '../shared/film-library-harvest.js'
import type { FilmScene, FilmStoryboardPanel } from '../shared/film-storyboard.js'
import { getStillPose } from '../shared/story-stills.js'
import type { StoryArtStyleId } from '../shared/story-art-styles.js'
import type { StoryLibraryAsset } from '../shared/story-types.js'
import { generateStoryCharacter, generateStoryEnvironment } from './story-asset-gen.js'
import { saveStoryAsset } from './story-library.js'

function identityUrl(library: StoryLibraryAsset[], name: string): string | undefined {
  const base = characterBaseName(name).trim().toLowerCase()
  const people = library.filter(
    (a) =>
      a.type === 'character' &&
      a.imageUrl &&
      characterBaseName(a.name).trim().toLowerCase() === base,
  )
  const studio = people.find((a) => !isHarvestedFromStill(a))
  return (studio ?? people[0])?.imageUrl
}

export async function ensurePanelPieces(opts: {
  userId: string
  panel: FilmStoryboardPanel
  scene?: FilmScene
  styleId: StoryArtStyleId | string
  library: StoryLibraryAsset[]
}): Promise<{ library: StoryLibraryAsset[]; noteDe: string }> {
  const added: StoryLibraryAsset[] = []
  const bits: string[] = []
  const styleId = opts.styleId
  const roomHint = opts.panel.background.hint || opts.panel.settingHint || opts.scene?.title || 'Raum'
  const roomName = roomHint.trim().slice(0, 48) || 'Raum'
  const start = opts.library
  const compose = libraryForCompose(start)

  const jobs: Array<Promise<void>> = []

  const isCloseup = (opts.panel.shot ?? 'wide') === 'closeup'
  if (!isCloseup && !shouldSkipBackground(compose, roomHint)) {
    jobs.push(
      (async () => {
        const env = await generateStoryEnvironment(
          `${roomHint}. ${opts.panel.imageCue || ''}. Complete empty interior matching THIS description (furniture, carpets, table, cushions as written). No people, no leftover generic living room from another story.`,
          roomName,
          styleId as StoryArtStyleId,
        )
        const saved = await saveStoryAsset(opts.userId, {
          type: 'environment',
          name: roomName,
          description: roomHint,
          imageUrl: env.imageUrl,
          tags: environmentPieceTags(roomHint),
          styleId: env.styleId,
        })
        added.push(saved)
        bits.push(`vollständiger Raum «${roomName}»`)
      })(),
    )
  }

  for (const pl of opts.panel.placements) {
    if (shouldSkipCharacterPose(compose, pl.name, pl.poseId)) continue
    const pose = getStillPose(pl.poseId)
    const ref = identityUrl(compose, pl.name)
    jobs.push(
      (async () => {
        const made = await generateStoryCharacter(
          `${pl.name}, ${pose.label}, ${pl.poseHint || pose.hintDe}. ${opts.panel.expressionHint || 'natürlicher Blick'}.`,
          pl.name,
          styleId as StoryArtStyleId,
          pose.legPoseId,
          pose.headAngleId,
          pose.armPoseId,
          ref,
          undefined,
          pl.poseId,
          false,
          false,
        )
        const saved = await saveStoryAsset(opts.userId, {
          type: 'character',
          name: pl.name,
          description: `${pl.name} · ${pose.label}`,
          imageUrl: made.imageUrl,
          tags: characterPieceTags(pl.poseId),
          styleId: made.styleId,
          legPoseId: pose.legPoseId,
          headAngleId: pose.headAngleId,
          armPoseId: pose.armPoseId,
        })
        added.push(saved)
        bits.push(`vollständige Figur ${pl.name} (${pose.label})`)
      })(),
    )
  }

  const results = await Promise.allSettled(jobs)
  for (const result of results) {
    if (result.status === 'rejected') {
      const msg = result.reason instanceof Error ? result.reason.message : 'Teil fehlgeschlagen.'
      bits.push(msg)
    }
  }

  const library = [...added, ...start]
  const noteDe =
    bits.length === 0
      ? 'Raum und Figuren waren schon im Welt-Regal.'
      : `Vollständig einzeln: ${bits.slice(0, 6).join(', ')}.`
  return { library, noteDe }
}
