import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, sendError } from './api-utils.js'
import { getDialog, updateDialog } from './firestore.js'
import { uploadDialogImage } from './image-storage.js'
import {
  generateDialogFromTopic,
  generateDialogFromSentences,
  chatForDialog,
  translateDialog,
  applyBirkenbihl,
  splitIntoSections,
  buildCharacterBible,
  generateSectionImage,
  planLineImages,
  generateUploadedImage,
  applyLineImageBeats,
  isAiConfigured,
} from './ai.js'
import type { ChatMessage, Dialog, DialogLength, DialogSection } from '../shared/types.js'

export function handleAiStatus(_req: VercelRequest, res: VercelResponse) {
  res.json({ configured: isAiConfigured() })
}

export async function handleGenerateTopic(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAuth(req)
    const { topic, targetLanguage, length } = req.body as {
      topic?: string
      targetLanguage?: string
      length?: DialogLength
    }
    if (!topic || !targetLanguage || !length) {
      res.status(400).json({ error: 'Pflichtfelder fehlen.' })
      return
    }
    const result = await generateDialogFromTopic(topic, targetLanguage, length)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleGenerateSentences(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAuth(req)
    const { sentences, targetLanguage, length } = req.body as {
      sentences?: string[]
      targetLanguage?: string
      length?: DialogLength
    }
    if (!sentences?.length || !targetLanguage || !length) {
      res.status(400).json({ error: 'Pflichtfelder fehlen.' })
      return
    }
    const result = await generateDialogFromSentences(sentences, targetLanguage, length)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleGenerateChat(req: VercelRequest, res: VercelResponse) {
  try {
    await requireAuth(req)
    const { messages, targetLanguage, length } = req.body as {
      messages?: ChatMessage[]
      targetLanguage?: string
      length?: DialogLength
    }
    if (!messages?.length || !targetLanguage || !length) {
      res.status(400).json({ error: 'Pflichtfelder fehlen.' })
      return
    }
    const result = await chatForDialog(messages, targetLanguage, length)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
}

function dialogIdFromRequest(req: VercelRequest, body: { dialogId?: string }): string | undefined {
  return body.dialogId ?? (req.query.dialogId as string | undefined)
}

async function ensureCharacterBibleOnDialog(
  dialog: Dialog,
  userId: string,
): Promise<Dialog> {
  if (dialog.characterBible?.length) return dialog
  const characterBible = await buildCharacterBible(dialog)
  const updated = await updateDialog(dialog.id, userId, { characterBible })
  return updated ?? { ...dialog, characterBible }
}

async function attachSectionImage(
  dialog: Dialog,
  section: DialogSection,
  userId: string,
) {
  const withBible = await ensureCharacterBibleOnDialog(dialog, userId)
  const { imageUrl: dataUrl, prompt } = await generateSectionImage(
    section,
    withBible.title,
    withBible.characterBible,
  )
  let imageUrl = dataUrl
  try {
    imageUrl = await uploadDialogImage(dataUrl, dialog.id, section.id)
  } catch (storageErr) {
    console.warn('Storage-Upload fehlgeschlagen, nutze Data-URL:', storageErr)
  }
  const sections = dialog.sections.map((s) =>
    s.id === section.id ? { ...s, imageUrl, imagePrompt: prompt } : s,
  )
  const updated = await updateDialog(dialog.id, userId, {
    sections,
    characterBible: withBible.characterBible,
  })
  return { updated, imageUrl, sectionId: section.id }
}

export async function handleTranslate(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const body = req.body as { dialogId?: string; targetLanguage?: string }
    const dialogId = dialogIdFromRequest(req, body)
    const { targetLanguage } = body
    if (!dialogId || !targetLanguage) {
      res.status(400).json({ error: 'dialogId und Zielsprache fehlen.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const allLines = dialog.sections.flatMap((s) => s.lines)
    const translated = await translateDialog(allLines, targetLanguage)
    let offset = 0
    const sections = dialog.sections.map((sec) => {
      const lines = translated.slice(offset, offset + sec.lines.length)
      offset += sec.lines.length
      return { ...sec, lines }
    })
    const updated = await updateDialog(dialog.id, user.uid, { targetLanguage, sections })
    res.json({ dialog: updated })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleBirkenbihl(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const body = req.body as {
      dialogId?: string
      nativeLanguage?: string
      includeRomanization?: boolean
    }
    const dialogId = dialogIdFromRequest(req, body)
    const { nativeLanguage, includeRomanization } = body
    if (!dialogId || !nativeLanguage) {
      res.status(400).json({ error: 'dialogId und Muttersprache fehlen.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const sections = []
    for (const sec of dialog.sections) {
      const lines = await applyBirkenbihl(
        sec.lines,
        nativeLanguage,
        dialog.targetLanguage,
        includeRomanization !== false,
      )
      sections.push({ ...sec, lines })
    }
    const updated = await updateDialog(dialog.id, user.uid, {
      sourceLanguage: nativeLanguage,
      sections,
    })
    res.json({ dialog: updated })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleSplit(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const body = req.body as { dialogId?: string }
    const dialogId = dialogIdFromRequest(req, body)
    if (!dialogId) {
      res.status(400).json({ error: 'dialogId fehlt.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const allLines = dialog.sections.flatMap((s) => s.lines)
    const sections = await splitIntoSections(allLines)
    const updated = await updateDialog(dialog.id, user.uid, { sections })
    res.json({ dialog: updated })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleImageLines(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const body = req.body as {
      dialogId?: string
      sectionId?: string
      beatIndex?: number
      replan?: boolean
    }
    const dialogId = dialogIdFromRequest(req, body)
    const sectionId = body.sectionId
    if (!dialogId || !sectionId) {
      res.status(400).json({ error: 'dialogId und sectionId fehlen.' })
      return
    }
    let dialog = await getDialog(dialogId, user.uid)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const section = dialog.sections.find((s) => s.id === sectionId)
    if (!section) {
      res.status(404).json({ error: 'Abschnitt nicht gefunden.' })
      return
    }

    dialog = await ensureCharacterBibleOnDialog(dialog, user.uid)

    let beats = section.lineImageBeats
    const beatIndex = body.beatIndex ?? 0
    if (!beats?.length || body.replan) {
      beats = await planLineImages(section, dialog)
    }
    if (!beats.length) {
      res.status(400).json({ error: 'Keine Bildszenen geplant.' })
      return
    }
    if (beatIndex >= beats.length) {
      res.json({
        dialog,
        done: true,
        totalBeats: beats.length,
        currentBeat: beats.length,
      })
      return
    }

    const beat = beats[beatIndex]
    if (!beat.imageUrl) {
      const imageUrl = await generateUploadedImage(
        beat.prompt,
        dialog.id,
        `${section.id}-beat-${beat.id}`,
        dialog.characterBible,
      )
      beats = beats.map((b, i) => (i === beatIndex ? { ...b, imageUrl } : b))
    }

    const lines = applyLineImageBeats(section.lines, beats)
    const sections = dialog.sections.map((s) =>
      s.id === section.id
        ? {
            ...s,
            lines,
            lineImageBeats: beats,
            imageUrl: lines.find((l) => l.imageUrl)?.imageUrl ?? s.imageUrl,
          }
        : s,
    )
    const updated = await updateDialog(dialog.id, user.uid, {
      sections,
      characterBible: dialog.characterBible,
    })
    const done = beatIndex + 1 >= beats.length
    res.json({
      dialog: updated,
      done,
      totalBeats: beats.length,
      currentBeat: beatIndex + 1,
      reason: beat.reason,
    })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleImageAll(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { dialogId?: string; sectionId?: string }
  if (!body.sectionId) {
    res.status(400).json({
      error: 'Bitte Bilder einzeln generieren (ein Abschnitt pro Anfrage).',
    })
    return
  }
  return handleImage(req, res)
}

export async function handleImage(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const body = req.body as { dialogId?: string; sectionId?: string }
    const dialogId = dialogIdFromRequest(req, body)
    const sectionId = body.sectionId ?? (req.query.sectionId as string | undefined)
    if (!dialogId || !sectionId) {
      res.status(400).json({ error: 'dialogId und sectionId fehlen.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const section = dialog.sections.find((s) => s.id === sectionId)
    if (!section) {
      res.status(404).json({ error: 'Abschnitt nicht gefunden.' })
      return
    }
    const { updated, imageUrl, sectionId: sid } = await attachSectionImage(
      dialog,
      section,
      user.uid,
    )
    res.json({ dialog: updated, imageUrl, sectionId: sid })
  } catch (err) {
    sendError(res, err)
  }
}
