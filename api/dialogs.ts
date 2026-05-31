import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, methodNotAllowed, sendError } from '../lib/api-utils.js'
import { listDialogs, createDialog } from '../lib/firestore.js'
import type { DialogSection } from '../shared/types.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    if (req.method === 'GET') {
      const dialogs = await listDialogs(user.uid)
      res.json({ dialogs })
      return
    }
    if (req.method === 'POST') {
      const { title, sourceLanguage, targetLanguage, length, sections } = req.body as {
        title?: string
        sourceLanguage?: string
        targetLanguage?: string
        length?: string
        sections?: DialogSection[]
      }
      if (!title || !targetLanguage || !length || !sections?.length) {
        res.status(400).json({ error: 'Pflichtfelder fehlen.' })
        return
      }
      const dialog = await createDialog(user.uid, {
        title,
        sourceLanguage: sourceLanguage ?? 'de',
        targetLanguage,
        length: length as 'short' | 'medium' | 'long',
        sections,
      })
      res.status(201).json({ dialog })
      return
    }
    methodNotAllowed(res)
  } catch (err) {
    sendError(res, err)
  }
}
