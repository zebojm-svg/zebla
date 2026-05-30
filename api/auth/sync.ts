import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth } from '../../lib/firebase-admin.js'
import { requireAuth, methodNotAllowed, sendError } from '../../lib/api-utils.js'
import { upsertUserProfile } from '../../lib/firestore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    methodNotAllowed(res)
    return
  }

  try {
    const authUser = await requireAuth(req)
    const { name } = req.body as { name?: string }

    const userRecord = await adminAuth().getUser(authUser.uid)
    const isGoogle = userRecord.providerData.some(
      (p) => p.providerId === 'google.com',
    )

    const profile = await upsertUserProfile(authUser.uid, {
      name: name ?? userRecord.displayName ?? authUser.name ?? 'Nutzer',
      email: authUser.email ?? userRecord.email,
      authType: isGoogle ? 'google' : 'student',
    })

    res.json({
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        authType: profile.authType,
      },
    })
  } catch (err) {
    sendError(res, err)
  }
}
