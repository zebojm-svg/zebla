import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, sendError } from '../../lib/api-utils.js'
import { getDialog, updateDialog } from '../../lib/firestore.js'
import {
  generateDialogFromTopic,
  generateDialogFromSentences,
  chatForDialog,
  translateDialog,
  applyBirkenbihl,
  splitIntoSections,
  generateSectionImage,
  isAiConfigured,
} from '../../lib/ai.js'
import type { ChatMessage, DialogLength } from '../../shared/types.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Methode nicht erlaubt.' })
    return
  }

  try {
    const path = req.query.path
    const segments = Array.isArray(path) ? path : path ? [path] : []
    const route = segments.join('/')

    if (route === 'status' && req.method === 'GET') {
      res.json({ configured: isAiConfigured() })
      return
    }

    const user = await requireAuth(req)

    if (route === 'generate/topic' && req.method === 'POST') {
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
      return
    }

    if (route === 'generate/sentences' && req.method === 'POST') {
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
      return
    }

    if (route === 'generate/chat' && req.method === 'POST') {
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
      return
    }

    if (route.startsWith('translate/') && req.method === 'POST') {
      const dialogId = route.slice('translate/'.length)
      const { targetLanguage } = req.body as { targetLanguage?: string }
      if (!targetLanguage) {
        res.status(400).json({ error: 'Zielsprache fehlt.' })
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
      return
    }

    if (route.startsWith('birkenbihl/') && req.method === 'POST') {
      const dialogId = route.slice('birkenbihl/'.length)
      const { nativeLanguage } = req.body as { nativeLanguage?: string }
      if (!nativeLanguage) {
        res.status(400).json({ error: 'Muttersprache fehlt.' })
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
      return
    }

    if (route.startsWith('split/') && req.method === 'POST') {
      const dialogId = route.slice('split/'.length)
      const dialog = await getDialog(dialogId, user.uid)
      if (!dialog) {
        res.status(404).json({ error: 'Dialog nicht gefunden.' })
        return
      }
      const allLines = dialog.sections.flatMap((s) => s.lines)
      const sections = await splitIntoSections(allLines)
      const updated = await updateDialog(dialog.id, user.uid, { sections })
      res.json({ dialog: updated })
      return
    }

    if (route.startsWith('image-all/') && req.method === 'POST') {
      const dialogId = route.slice('image-all/'.length)
      const dialog = await getDialog(dialogId, user.uid)
      if (!dialog) {
        res.status(404).json({ error: 'Dialog nicht gefunden.' })
        return
      }
      const sections = []
      for (const sec of dialog.sections) {
        const { imageUrl, prompt } = await generateSectionImage(sec, dialog.title)
        sections.push({ ...sec, imageUrl, imagePrompt: prompt })
      }
      const updated = await updateDialog(dialog.id, user.uid, { sections })
      res.json({ dialog: updated })
      return
    }

    if (route.startsWith('image/') && req.method === 'POST') {
      const rest = route.slice('image/'.length)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        res.status(400).json({ error: 'Abschnitts-ID fehlt.' })
        return
      }
      const dialogId = rest.slice(0, slash)
      const sectionId = rest.slice(slash + 1)
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
      return
    }

    res.status(404).json({ error: 'Route nicht gefunden.' })
  } catch (err) {
    sendError(res, err)
  }
}
