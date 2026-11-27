import type { Dialog } from '../shared/types.js'
import { downloadImageByUrl } from './image-storage.js'
import { beatsForSection } from './visual-script.js'
import { regieJson } from './ai.js'

export interface VisualCriticResult {
  ok: boolean
  notes: string
  extraConstraintsEn: string
  retryBeatIndexes: number[]
}

function mimeFromUrl(url: string): string {
  if (url.includes('.jpg') || url.includes('jpeg')) return 'image/jpeg'
  return 'image/png'
}

export async function reviewRecentBeats(
  dialog: Dialog,
  sectionId: string,
  fromBeat: number,
  toBeat: number,
): Promise<VisualCriticResult> {
  const brief = dialog.visualBrief
  const beats = dialog.visualScript ? beatsForSection(dialog.visualScript, sectionId) : []
  const slice = beats.slice(fromBeat, toBeat + 1).filter((b) => b.imageUrl)
  if (!slice.length) {
    return { ok: true, notes: '', extraConstraintsEn: '', retryBeatIndexes: [] }
  }

  const section = dialog.sections.find((s) => s.id === sectionId)
  const lineNotes = slice.map((b) => {
    const texts = (b.lineIndices ?? [])
      .map((i) => section?.lines[i])
      .filter(Boolean)
      .map((l) => `${l!.speaker}: ${l!.text}`)
      .join(' / ')
    return {
      shotType: b.shotType ?? 'speaker',
      mustShowEn: b.mustShowEn,
      mood: b.mood,
      speaker: b.activeSpeaker,
      texts,
    }
  })

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      text:
        `You are a silent picture-story editor. Compare these images to the brief and the spoken lines.\n` +
        `BRIEF:\n${brief?.directorPromptEn ?? '(none)'}\n` +
        `AGE: ${brief?.ageEn ?? '?'}\nSTYLE: ${brief?.artStyle ?? '?'}\n` +
        `MUST SHOW: ${(brief?.mustShowEn ?? []).join('; ')}\n` +
        `LINES FOR THESE FRAMES:\n${JSON.stringify(lineNotes, null, 2)}\n\n` +
        `Fail if: wrong age (adults vs teens/children), photoreal when illustration was asked, ` +
        `named object missing (brochure, robot, toothpaste…), both people wear the same outfit, ` +
        `insert shot is actually another talking head, faces/clothes drift, all expressions identical-neutral.\n` +
        `JSON: { "ok": boolean, "notes": "German, short, for logs", "extraConstraintsEn": "English lock to append to later prompts", "retryIndexes": number[] }\n` +
        `retryIndexes: 0-based index inside THIS batch only, only if the frame is clearly wrong.`,
    },
  ]

  for (const beat of slice) {
    try {
      const { buffer, contentType } = await downloadImageByUrl(beat.imageUrl!)
      const b64 = buffer.toString('base64')
      if (b64.length > 6_000_000) continue
      parts.push({
        inlineData: {
          mimeType: contentType || mimeFromUrl(beat.imageUrl!),
          data: b64,
        },
      })
    } catch {
      /* skip unreadables */
    }
  }

  if (parts.length < 2) {
    return { ok: true, notes: 'Bilder nicht prüfbar.', extraConstraintsEn: '', retryBeatIndexes: [] }
  }

  const [prompt, ...images] = parts
  let parsed: {
    ok?: boolean
    notes?: string
    extraConstraintsEn?: string
    retryIndexes?: number[]
  }
  try {
    parsed = await regieJson<typeof parsed>(
      'text' in prompt ? prompt.text : '',
      '',
      images.flatMap((part) => ('inlineData' in part ? [part.inlineData] : [])),
      { temperature: 0.2 },
    )
  } catch (err) {
    if (err instanceof Error && err.message === 'JSON der KI war ungültig.') {
      return { ok: true, notes: 'Kritik unlesbar.', extraConstraintsEn: '', retryBeatIndexes: [] }
    }
    throw err
  }

  const retryBeatIndexes = (parsed.retryIndexes ?? [])
    .filter((i) => Number.isInteger(i) && i >= 0 && i < slice.length)
    .map((i) => fromBeat + i)

  return {
    ok: parsed.ok !== false,
    notes: (parsed.notes ?? '').slice(0, 400),
    extraConstraintsEn: (parsed.extraConstraintsEn ?? '').slice(0, 800),
    retryBeatIndexes,
  }
}
