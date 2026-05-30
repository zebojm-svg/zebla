import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loginWithStudentCode } from '../../lib/firestore.js'
import { methodNotAllowed, sendError } from '../../lib/api-utils.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    methodNotAllowed(res)
    return
  }

  try {
    const { code, name } = req.body as { code?: string; name?: string }
    if (!code?.trim()) {
      res.status(400).json({ error: 'Schülercode fehlt.' })
      return
    }

    const { customToken, profile } = await loginWithStudentCode(code, name)
    res.json({
      customToken,
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        authType: profile.authType,
      },
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'Ungültiger Schülercode.') {
      res.status(401).json({ error: err.message })
      return
    }
    sendError(res, err)
  }
}
