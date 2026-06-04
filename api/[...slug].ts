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
  getDialogByShareToken,
  setDialogSharing,
  cloneDialog,
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
import { checkTtsHealth } from '../lib/tts.js'
import {
  ensureDialogAudio,
  getOrCreateLineAudio,
  regenerateSpeakerAudio,
} from '../lib/dialog-audio.js'
import { exportDialogAudioZip } from '../lib/dialog-audio-export.js'
import { downloadLineAudio } from '../lib/audio-storage.js'
import { findLineInDialog } from '../lib/dialog-audio.js'
import { downloadImageByUrl } from '../lib/image-storage.js'
import type { DialogSection, Dialog } from '../shared/types.js'

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

    if (route === 'shared' && req.method === 'GET') {
      const token = req.query.token as string
      if (!token?.trim()) {
        res.status(400).json({ error: 'Freigabe-Link ungültig.' })
        return
      }
      const dialog = await getDialogByShareToken(token.trim())
      if (!dialog) {
        res.status(404).json({ error: 'Dialog nicht gefunden oder Freigabe beendet.' })
        return
      }
      res.json({
        dialog: {
          title: dialog.title,
          sourceLanguage: dialog.sourceLanguage,
          targetLanguage: dialog.targetLanguage,
          length: dialog.length,
          sections: dialog.sections,
        },
      })
      return
    }

    if (route === 'dialog-share' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { id, enabled } = req.body as { id?: string; enabled?: boolean }
      if (!id) {
        res.status(400).json({ error: 'ID fehlt.' })
        return
      }
      const dialog = await setDialogSharing(id, user.uid, enabled !== false)
      if (!dialog) {
        res.status(404).json({ error: 'Dialog nicht gefunden.' })
        return
      }
      res.json({ dialog, shareToken: dialog.shareToken ?? null })
      return
    }

    if (route === 'dialog-clone' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { token, folderId } = req.body as {
        token?: string
        folderId?: string | null
      }
      if (!token?.trim()) {
        res.status(400).json({ error: 'Freigabe-Link ungültig.' })
        return
      }
      const source = await getDialogByShareToken(token.trim())
      if (!source) {
        res.status(404).json({ error: 'Dialog nicht gefunden oder Freigabe beendet.' })
        return
      }
      const dialog = await cloneDialog(source, user.uid, folderId ?? null)
      res.status(201).json({ dialog })
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
        const {
          title,
          sourceLanguage,
          targetLanguage,
          length,
          sections,
          folderId,
          creationMode,
          creationPrompt,
          creationChat,
          imageDirection,
        } = req.body as {
          title?: string
          sourceLanguage?: string
          targetLanguage?: string
          length?: string
          sections?: DialogSection[]
          folderId?: string | null
          creationMode?: string
          creationPrompt?: string
          creationChat?: Dialog['creationChat']
          imageDirection?: string
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
          creationMode: creationMode as Dialog['creationMode'] | undefined,
          creationPrompt,
          creationChat,
          imageDirection,
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

    if ((route === 'tts-status' || route === 'tts/status') && req.method === 'GET') {
      const lang = req.query.lang as string | undefined
      const health = await checkTtsHealth(lang)
      res.json(health)
      return
    }

    if (route === 'tts' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { dialogId, lineId, rate } = req.body as {
        dialogId?: string
        lineId?: string
        rate?: number
      }
      if (!dialogId || !lineId) {
        res.status(400).json({ error: 'dialogId und lineId fehlen.' })
        return
      }
      try {
        const result = await getOrCreateLineAudio(
          dialogId,
          user.uid,
          lineId,
          rate ?? 0.85,
        )
        res.json({
          audioUrl: result.audioUrl,
          cached: result.cached,
          dialog: result.dialog,
        })
      } catch (err) {
        sendError(res, err)
      }
      return
    }

    if (route === 'dialog-audio-export' && req.method === 'GET') {
      const user = await requireAuth(req)
      const dialogId = req.query.dialogId as string | undefined
      const format = (req.query.format as string | undefined) ?? 'zip'
      if (!dialogId) {
        res.status(400).json({ error: 'dialogId fehlt.' })
        return
      }
      if (format !== 'zip') {
        res.status(400).json({ error: 'Nur format=zip über die API. WAV wird im Browser erstellt.' })
        return
      }
      try {
        const { buffer, filename } = await exportDialogAudioZip(dialogId, user.uid)
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        res.send(buffer)
      } catch (err) {
        sendError(res, err)
      }
      return
    }

    if (route === 'dialog-audio-line' && req.method === 'GET') {
      const user = await requireAuth(req)
      const dialogId = req.query.dialogId as string | undefined
      const lineId = req.query.lineId as string | undefined
      if (!dialogId || !lineId) {
        res.status(400).json({ error: 'dialogId und lineId fehlen.' })
        return
      }
      try {
        const dialog = await getDialog(dialogId, user.uid)
        if (!dialog) {
          res.status(404).json({ error: 'Dialog nicht gefunden.' })
          return
        }
        const found = findLineInDialog(dialog, lineId)
        if (!found?.line.audioUrl) {
          res.status(404).json({ error: 'Keine Audiodatei für diese Zeile.' })
          return
        }
        const buffer = await downloadLineAudio(dialogId, lineId)
        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Cache-Control', 'private, max-age=3600')
        res.send(buffer)
      } catch (err) {
        sendError(res, err)
      }
      return
    }

    if (route === 'dialog-image' && req.method === 'GET') {
      const user = await requireAuth(req)
      const dialogId = req.query.dialogId as string | undefined
      const lineId = req.query.lineId as string | undefined
      if (!dialogId || !lineId) {
        res.status(400).json({ error: 'dialogId und lineId fehlen.' })
        return
      }
      try {
        const dialog = await getDialog(dialogId, user.uid)
        if (!dialog) {
          res.status(404).json({ error: 'Dialog nicht gefunden.' })
          return
        }
        const found = findLineInDialog(dialog, lineId)
        if (!found) {
          res.status(404).json({ error: 'Zeile nicht gefunden.' })
          return
        }
        const imageUrl =
          found.line.imageUrl ?? found.section.imageUrl ?? null
        if (!imageUrl) {
          res.status(404).json({ error: 'Kein Bild für diese Zeile.' })
          return
        }
        const { buffer, contentType } = await downloadImageByUrl(imageUrl)
        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', 'private, max-age=3600')
        res.send(buffer)
      } catch (err) {
        sendError(res, err)
      }
      return
    }

    if (route === 'dialog-ensure-audio' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { dialogId, rate, force } = req.body as {
        dialogId?: string
        rate?: number
        force?: boolean
      }
      if (!dialogId) {
        res.status(400).json({ error: 'dialogId fehlt.' })
        return
      }
      try {
        const result = await ensureDialogAudio(dialogId, user.uid, rate ?? 0.85, {
          force: force === true,
        })
        res.json(result)
      } catch (err) {
        sendError(res, err)
      }
      return
    }

    if (route === 'dialog-regenerate-speaker-audio' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { dialogId, speaker } = req.body as { dialogId?: string; speaker?: string }
      if (!dialogId || !speaker?.trim()) {
        res.status(400).json({ error: 'dialogId und speaker fehlen.' })
        return
      }
      try {
        const result = await regenerateSpeakerAudio(dialogId, user.uid, speaker.trim())
        res.json(result)
      } catch (err) {
        sendError(res, err)
      }
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
