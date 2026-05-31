import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleImageAll } from '../lib/ai-handlers.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Methode nicht erlaubt.' })
    return
  }
  return handleImageAll(req, res)
}
