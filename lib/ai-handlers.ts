import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, sendError } from './api-utils.js'
import { getDialog, updateDialog } from './firestore.js'
import {
  generateDialogFromTopic,
  generateDialogFromSentences,
  chatForDialog,
  translateDialog,
  applyBirkenbihl,
  splitIntoSections,
  generateSectionImage,
  isAiConfigured,
} from './ai.js'
import type { ChatMessage, DialogLength } from '../shared/types.js'

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
    const body = req.body as { dialogId?: string; nativeLanguage?: string }
    const dialogId = dialogIdFromRequest(req, body)
    const { nativeLanguage } = body
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
      const lines = await applyBirkenbihl(sec.lines, nativeLanguage)
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

export async function handleImageAll(req: VercelRequest, res: VercelResponse) {
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
    const sections = []
    for (let i = 0; i < dialog.sections.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
      const sec = dialog.sections[i]
      const { imageUrl, prompt } = await generateSectionImage(sec, dialog.title)
      sections.push({ ...sec, imageUrl, imagePrompt: prompt })
    }
    const updated = await updateDialog(dialog.id, user.uid, { sections })
    res.json({ dialog: updated })
  } catch (err) {
    sendError(res, err)
  }
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
    const { imageUrl, prompt } = await generateSectionImage(section, dialog.title)
    const sections = dialog.sections.map((s) =>
      s.id === section.id ? { ...s, imageUrl, imagePrompt: prompt } : s,
    )
    const updated = await updateDialog(dialog.id, user.uid, { sections })
    res.json({ dialog: updated, imageUrl })
  } catch (err) {
    sendError(res, err)
  }
}
