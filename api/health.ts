import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendError } from '../lib/api-utils.js'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    res.json({ ok: true, service: 'zebla' })
  } catch (err) {
    sendError(res, err)
  }
}
