import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  requireAuth,
  methodNotAllowed,
  sendError,
} from '../../lib/api-utils.js'
import {
  getDialog,
  updateDialog,
  deleteDialog,
} from '../../lib/firestore.js'
import type { DialogSection } from '../../shared/types.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const id = req.query.id as string

    if (!id) {
      res.status(400).json({ error: 'ID fehlt.' })
      return
    }

    if (req.method === 'GET') {
      const dialog = await getDialog(id, user.uid)
      if (!dialog) {
        res.status(404).json({ error: 'Dialog nicht gefunden.' })
        return
      }
      res.json({ dialog })
      return
    }

    if (req.method === 'PATCH') {
      const body = req.body as Partial<{
        title: string
        sourceLanguage: string
        targetLanguage: string
        sections: DialogSection[]
      }>
      const dialog = await updateDialog(id, user.uid, body)
      if (!dialog) {
        res.status(404).json({ error: 'Dialog nicht gefunden.' })
        return
      }
      res.json({ dialog })
      return
    }

    if (req.method === 'DELETE') {
      const ok = await deleteDialog(id, user.uid)
      if (!ok) {
        res.status(404).json({ error: 'Dialog nicht gefunden.' })
        return
      }
      res.json({ ok: true })
      return
    }

    methodNotAllowed(res)
  } catch (err) {
    sendError(res, err)
  }
}
