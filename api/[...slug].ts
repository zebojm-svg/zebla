import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth } from '../lib/firebase-admin.js'
import {
  requireAuth,
  methodNotAllowed,
  sendError,
} from '../lib/api-utils.js'
import {
  loginWithStudentCode,
  listDialogs,
  createDialog,
  getDialog,
  updateDialog,
  deleteDialog,
  upsertUserProfile,
} from '../lib/firestore.js'
import {
  handleAiStatus,
  handleGenerateTopic,
  handleGenerateSentences,
  handleGenerateChat,
  handleTranslate,
  handleBirkenbihl,
  handleSplit,
  handleImage,
  handleImageAll,
} from '../lib/ai-handlers.js'
import type { DialogSection } from '../shared/types.js'

function getRoute(req: VercelRequest): string {
  const slug = req.query.slug
  if (Array.isArray(slug)) return slug.join('/')
  if (typeof slug === 'string') return slug
  return ''
}

/** Normalisiert alte Pfade (generate/topic) auf neue (topic). */
function normalizeAiRoute(route: string): string {
  if (route.startsWith('ai/generate/')) {
    return 'ai/' + route.slice('ai/generate/'.length)
  }
  return route
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = normalizeAiRoute(getRoute(req))

  try {
    // GET /api/health
    if (route === 'health' && req.method === 'GET') {
      res.json({ ok: true, service: 'zebla' })
      return
    }

    // POST /api/auth/student
    if (route === 'auth/student' && req.method === 'POST') {
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
      return
    }

    // POST /api/auth/sync
    if (route === 'auth/sync' && req.method === 'POST') {
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
      return
    }

    // GET|POST /api/dialogs
    if (route === 'dialogs') {
      const user = await requireAuth(req)
      if (req.method === 'GET') {
        const dialogs = await listDialogs(user.uid)
        res.json({ dialogs })
        return
      }
      if (req.method === 'POST') {
        const { title, sourceLanguage, targetLanguage, length, sections } =
          req.body as {
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
      return
    }

    // GET|PATCH|DELETE /api/dialogs/:id
    if (route.startsWith('dialogs/')) {
      const user = await requireAuth(req)
      const id = route.slice('dialogs/'.length)
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
        const dialog = await updateDialog(id, user.uid, req.body)
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
      return
    }

    // Legacy: /api/ai/translate/:id -> set dialogId in query
    const translateLegacy = route.match(/^ai\/translate\/([^/]+)$/)
    if (translateLegacy && req.method === 'POST') {
      req.query.dialogId = translateLegacy[1]
      return handleTranslate(req, res)
    }
    const birkenbihlLegacy = route.match(/^ai\/birkenbihl\/([^/]+)$/)
    if (birkenbihlLegacy && req.method === 'POST') {
      req.query.dialogId = birkenbihlLegacy[1]
      return handleBirkenbihl(req, res)
    }
    const splitLegacy = route.match(/^ai\/split\/([^/]+)$/)
    if (splitLegacy && req.method === 'POST') {
      req.query.dialogId = splitLegacy[1]
      return handleSplit(req, res)
    }
    const imageAllLegacy = route.match(/^ai\/image-all\/([^/]+)$/)
    if (imageAllLegacy && req.method === 'POST') {
      req.query.dialogId = imageAllLegacy[1]
      return handleImageAll(req, res)
    }
    const imageLegacy = route.match(/^ai\/image\/([^/]+)\/([^/]+)$/)
    if (imageLegacy && req.method === 'POST') {
      req.query.dialogId = imageLegacy[1]
      req.query.sectionId = imageLegacy[2]
      return handleImage(req, res)
    }

    // AI routes
    if (route === 'ai/status' && req.method === 'GET') {
      handleAiStatus(req, res)
      return
    }
    if (route === 'ai/topic' && req.method === 'POST') {
      return handleGenerateTopic(req, res)
    }
    if (route === 'ai/sentences' && req.method === 'POST') {
      return handleGenerateSentences(req, res)
    }
    if (route === 'ai/chat' && req.method === 'POST') {
      return handleGenerateChat(req, res)
    }
    if (route === 'ai/translate' && req.method === 'POST') {
      return handleTranslate(req, res)
    }
    if (route === 'ai/birkenbihl' && req.method === 'POST') {
      return handleBirkenbihl(req, res)
    }
    if (route === 'ai/split' && req.method === 'POST') {
      return handleSplit(req, res)
    }
    if (route === 'ai/image' && req.method === 'POST') {
      return handleImage(req, res)
    }
    if (route === 'ai/image-all' && req.method === 'POST') {
      return handleImageAll(req, res)
    }

    res.status(404).json({ error: `API-Route nicht gefunden: ${route}` })
  } catch (err) {
    if (err instanceof Error && err.message === 'Ungültiger Schülercode.') {
      res.status(401).json({ error: err.message })
      return
    }
    sendError(res, err)
  }
}
