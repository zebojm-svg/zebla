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
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from '../lib/folders.js'
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
  handleImageLines,
} from '../lib/ai-handlers.js'
import type { DialogSection } from '../shared/types.js'

function getRoute(req: VercelRequest): string {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname.replace(/^\/api\/?/, '')
  if (path) return path

  const slug = req.query.slug
  if (Array.isArray(slug)) return slug.join('/')
  if (typeof slug === 'string') return slug
  return ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getRoute(req)

  try {
    if (route === 'health' && req.method === 'GET') {
      res.json({ ok: true, service: 'zebla' })
      return
    }

    if (
      (route === 'student-login' || route === 'auth/student') &&
      req.method === 'POST'
    ) {
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

    if ((route === 'sync' || route === 'auth/sync') && req.method === 'POST') {
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

    if (route === 'library' && req.method === 'GET') {
      const user = await requireAuth(req)
      const [folders, dialogs] = await Promise.all([
        listFolders(user.uid),
        listDialogs(user.uid),
      ])
      res.json({ folders, dialogs })
      return
    }

    if (route === 'folders') {
      const user = await requireAuth(req)
      if (req.method === 'POST') {
        const { name, parentId } = req.body as {
          name?: string
          parentId?: string | null
        }
        if (!name?.trim()) {
          res.status(400).json({ error: 'Ordnername fehlt.' })
          return
        }
        try {
          const folder = await createFolder(user.uid, name, parentId ?? null)
          res.status(201).json({ folder })
        } catch (err) {
          res.status(400).json({
            error: err instanceof Error ? err.message : 'Ordner konnte nicht erstellt werden.',
          })
        }
        return
      }
      methodNotAllowed(res)
      return
    }

    if (route === 'folder') {
      const user = await requireAuth(req)
      const id = (req.query.id ?? (req.body as { id?: string })?.id) as string
      if (!id) {
        res.status(400).json({ error: 'ID fehlt.' })
        return
      }
      if (req.method === 'PATCH') {
        const { name, parentId } = req.body as {
          name?: string
          parentId?: string | null
        }
        try {
          const folder = await updateFolder(id, user.uid, { name, parentId })
          if (!folder) {
            res.status(404).json({ error: 'Ordner nicht gefunden.' })
            return
          }
          res.json({ folder })
        } catch (err) {
          res.status(400).json({
            error: err instanceof Error ? err.message : 'Ordner konnte nicht aktualisiert werden.',
          })
        }
        return
      }
      if (req.method === 'DELETE') {
        const ok = await deleteFolder(id, user.uid)
        if (!ok) {
          res.status(404).json({ error: 'Ordner nicht gefunden.' })
          return
        }
        res.json({ ok: true })
        return
      }
      methodNotAllowed(res)
      return
    }

    if (route === 'dialogs') {
      const user = await requireAuth(req)
      if (req.method === 'GET') {
        const dialogs = await listDialogs(user.uid)
        res.json({ dialogs })
        return
      }
      if (req.method === 'POST') {
        const { title, sourceLanguage, targetLanguage, length, sections, folderId } =
          req.body as {
            title?: string
            sourceLanguage?: string
            targetLanguage?: string
            length?: string
            sections?: DialogSection[]
            folderId?: string | null
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
          folderId: folderId ?? null,
        })
        res.status(201).json({ dialog })
        return
      }
      methodNotAllowed(res)
      return
    }

    if (route === 'dialog' || route.startsWith('dialogs/')) {
      const user = await requireAuth(req)
      const id =
        route.startsWith('dialogs/')
          ? route.slice('dialogs/'.length)
          : ((req.query.id ?? (req.body as { id?: string })?.id) as string)
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

    if (
      (route === 'ai-status' || route === 'ai/status') &&
      req.method === 'GET'
    ) {
      handleAiStatus(req, res)
      return
    }
    if (
      (route === 'topic' || route === 'ai/topic' || route === 'ai/generate/topic') &&
      req.method === 'POST'
    ) {
      return handleGenerateTopic(req, res)
    }
    if (
      (route === 'sentences' ||
        route === 'ai/sentences' ||
        route === 'ai/generate/sentences') &&
      req.method === 'POST'
    ) {
      return handleGenerateSentences(req, res)
    }
    if (
      (route === 'chat' || route === 'ai/chat' || route === 'ai/generate/chat') &&
      req.method === 'POST'
    ) {
      return handleGenerateChat(req, res)
    }
    if (
      (route === 'translate' || route === 'ai/translate') &&
      req.method === 'POST'
    ) {
      return handleTranslate(req, res)
    }
    if (
      (route === 'birkenbihl' || route === 'ai/birkenbihl') &&
      req.method === 'POST'
    ) {
      return handleBirkenbihl(req, res)
    }
    if ((route === 'split' || route === 'ai/split') && req.method === 'POST') {
      return handleSplit(req, res)
    }
    if (
      (route === 'image-lines' || route === 'ai/image-lines') &&
      req.method === 'POST'
    ) {
      return handleImageLines(req, res)
    }
    if ((route === 'image' || route === 'ai/image') && req.method === 'POST') {
      return handleImage(req, res)
    }
    if (
      (route === 'image-all' || route === 'ai/image-all') &&
      req.method === 'POST'
    ) {
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
