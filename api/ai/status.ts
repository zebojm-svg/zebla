import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleAiStatus } from '../../lib/ai-handlers.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Methode nicht erlaubt.' })
    return
  }
  handleAiStatus(req, res)
}
