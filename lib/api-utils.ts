import type { VercelRequest } from '@vercel/node'
import { adminAuth } from './firebase-admin.js'

export interface AuthUser {
  uid: string
  email?: string
  name?: string
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function requireAuth(req: VercelRequest): Promise<AuthUser> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError('Nicht angemeldet.', 401)
  }

  const token = header.slice(7)
  try {
    const decoded = await adminAuth().verifyIdToken(token)
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    }
  } catch {
    throw new HttpError('Sitzung abgelaufen.', 401)
  }
}

export function sendError(res: import('@vercel/node').VercelResponse, err: unknown) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error(err)
  const message = err instanceof Error ? err.message : 'Interner Fehler'
  res.status(500).json({ error: message })
}

export function methodNotAllowed(res: import('@vercel/node').VercelResponse) {
  res.status(405).json({ error: 'Methode nicht erlaubt.' })
}
