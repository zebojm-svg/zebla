import type { CharacterVisual, Dialog } from '../shared/types.js'
import { imagePlanningContext } from '../shared/dialog-image-context.js'
import { appearanceGuideFor, styleLockPrompt } from './ken-burns-style.js'

function formatCast(bible: CharacterVisual[]): string {
  return bible.map((c) => `${c.name}: ${c.description}`).join('; ')
}

function orderedSpeakers(dialog: Dialog): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const section of dialog.sections) {
    for (const line of section.lines) {
      if (!seen.has(line.speaker)) {
        seen.add(line.speaker)
        order.push(line.speaker)
      }
    }
  }
  return order
}

function sceneHintFromDirection(dialog: Dialog): string {
  if (dialog.visualBrief?.settingEn) return dialog.visualBrief.settingEn
  const dir = dialog.imageDirection?.trim()
  if (dir) return dir.slice(0, 200)
  const first = dialog.sections[0]?.title
  return first ? `setting related to "${first}"` : 'natural conversational setting'
}

/** Bild 0: alle Sprecher nebeneinander – Master-Referenz (nicht in der Diashow). */
export function buildReferenceImagePrompt(dialog: Dialog, bible?: CharacterVisual[]): string {
  const speakers = orderedSpeakers(dialog)
  const cast = bible?.length ? formatCast(bible) : speakers.join(', ')
  const imgCtx = imagePlanningContext(dialog)
  const scene = sceneHintFromDirection(dialog)
  const brief = dialog.visualBrief
  const appearance = brief?.castLockEn || appearanceGuideFor(brief?.artStyle, brief?.ageEn)
  const styleLock = brief?.stylePromptEn || styleLockPrompt(brief?.artStyle)
  const director = brief?.directorPromptEn ? `${brief.directorPromptEn} ` : ''

  return (
    `${director}` +
    `MASTER CAST REFERENCE SHEET (image 0) for a language-learning picture story. ` +
    `All ${speakers.length} speakers together, full upper bodies visible, in ${scene}. ` +
    `Speakers left to right: ${speakers.join(', ')}. ` +
    `Each person MUST match their locked description exactly: ${cast}. ` +
    `${appearance} ` +
    `If the story has a key prop (brochure, gadget), they look at it together. ` +
    `Same outfits and hairstyles they will wear in ALL later panels. ` +
    `Even lighting, clear faces, consistent scale — this image is the permanent visual standard. ` +
    `${imgCtx ? `${imgCtx}. ` : ''}` +
    `NOT looking at camera. ${styleLock}`
  )
}

export function referenceAnchorForPrompt(referencePrompt?: string): string {
  if (!referencePrompt?.trim()) return ''
  return (
    `MATCH MASTER CAST REFERENCE (image 0) EXACTLY — same faces, hair, outfits, body types, and setting as the established group reference: ${referencePrompt.trim().slice(0, 900)}. `
  )
}
