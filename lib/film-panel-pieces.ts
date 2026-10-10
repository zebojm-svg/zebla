/**
 * Fehlende Räume und Figuren einzeln erzeugen — nicht als Gruppenbild.
 */

import {
  identityReferenceUrl,
  identitySaveName,
} from '../shared/library-identities.js'
import {
  characterPieceTags,
  environmentPieceTags,
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
    if (shouldSkipCharacterPose(start, pl.name, pl.poseId)) continue
    const pose = getStillPose(pl.poseId)
    const saveName = identitySaveName(start, pl.name)
    const ref = identityReferenceUrl(start, pl.name)
    jobs.push(
      (async () => {
        const made = await generateStoryCharacter(
          `${saveName}, ${pose.label}, ${pl.poseHint || pose.hintDe}. ${opts.panel.expressionHint || 'natürlicher Blick'}.`,
          saveName,
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
          name: saveName,
          description: `${saveName} · ${pose.label}`,
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
