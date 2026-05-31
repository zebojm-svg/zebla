import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleAiStatus } from '../lib/ai-handlers.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  handleAiStatus(req, res)
}
