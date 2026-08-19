import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminAuth } from '../lib/firebase-admin.js'
import {
  requireAuth,
  methodNotAllowed,
  sendError,
  HttpError,
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
  setFolderSharing,
  cloneDialog,
  upsertUserProfile,
  getUserProfile,
  profileToClientUser,
} from '../lib/firestore.js'
import {
  createFolder,
  updateFolder,
  deleteFolder,
  getFolder,
} from '../lib/folders.js'
import {
  createClass,
  deleteClass,
  createStudentCode,
  listStudentCodes,
  deleteStudentCode,
  listClassesForTeacher,
  assertClassFolderAccess,
  getClass,
} from '../lib/classes.js'
import { loadLibraryForUser, enrichClientUser } from '../lib/library.js'
import {
  assertCanUseAi,
  requireProfile,
  requireRole,
  isProActive,
} from '../lib/access.js'
import { consumeQuota } from '../lib/usage.js'
import {
  createProCheckoutSession,
  confirmCheckoutSession,
  unlockProManually,
  isStripeConfigured,
  PRO_PRICE_CENTS,
} from '../lib/stripe.js'
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
  handleVisualBrief,
  handleVisualTest,
  handleVisualCritic,
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
import {
  generateStoryScene,
  generateStoryCharacter,
  generateStoryEnvironment,
} from '../lib/story-asset-gen.js'
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

async function gateAi(uid: string) {
  const profile = await requireProfile(uid)
  assertCanUseAi(profile)
  await consumeQuota(profile, 'aiCalls')
  return profile
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
      const { code, studentCode, name, classCode } = req.body as {
        code?: string
        studentCode?: string
        name?: string
        classCode?: string
      }
      const resolvedCode = (code ?? studentCode)?.trim()
      if (!resolvedCode) {
        res.status(400).json({ error: 'Schülercode fehlt.' })
        return
      }
      const { customToken, profile } = await loginWithStudentCode(
        resolvedCode,
        name,
        classCode,
      )
      res.json({
        customToken,
        user: await enrichClientUser(profile),
      })
      return
    }

    
    if (route === 'hub-sso' && req.method === 'POST') {
      const expected = process.env.HUB_SSO_SECRET?.trim()
      if (!expected) {
        res.status(503).json({ error: 'HUB_SSO_SECRET nicht konfiguriert.' })
        return
      }
      const body = req.body as { secret?: string; email?: string; name?: string }
      if (!body.secret || body.secret !== expected) {
        res.status(401).json({ error: 'Ungültiges SSO-Geheimnis.' })
        return
      }
      const email = body.email?.trim().toLowerCase()
      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'E-Mail fehlt.' })
        return
      }
      const displayName = body.name?.trim() || email

      let uid: string
      try {
        const existing = await adminAuth().getUserByEmail(email)
        uid = existing.uid
        if (displayName && existing.displayName !== displayName) {
          await adminAuth().updateUser(uid, { displayName })
        }
      } catch {
        const created = await adminAuth().createUser({
          email,
          displayName,
          emailVerified: true,
        })
        uid = created.uid
      }

      const profile = await upsertUserProfile(uid, {
        name: displayName,
        email,
        authType: 'google',
      })
      const customToken = await adminAuth().createCustomToken(uid, {
        src: 'zebotools',
      })
      res.json({
        customToken,
        user: await enrichClientUser(profile),
      })
      return
    }

    if (route === 'public-shared' && req.method === 'GET') {
      const { adminDb } = await import('../lib/firebase-admin.js')
      const snap = await adminDb()
        .collection('dialogs')
        .where('shareToken', '>', '')
        .limit(60)
        .get()
      const items = snap.docs
        .map((doc) => {
          const d = doc.data()
          const token = d.shareToken as string | null | undefined
          if (!token) return null
          return {
            id: doc.id,
            title: (d.title as string) || 'Dialog',
            sourceLanguage: d.sourceLanguage as string | undefined,
            targetLanguage: d.targetLanguage as string | undefined,
            shareToken: token,
            updatedAt: d.updatedAt as string | undefined,
          }
        })
        .filter(Boolean)
      res.json({ items })
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
        user: await enrichClientUser(profile),
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
      const profile = await requireRole(user.uid, ['teacher', 'master'])
      const { id, enabled } = req.body as { id?: string; enabled?: boolean }
      if (!id) {
        res.status(400).json({ error: 'ID fehlt.' })
        return
      }
      const dialog = await setDialogSharing(id, user.uid, enabled !== false, profile)
      if (!dialog) {
        res.status(404).json({
          error:
            'Dialog nicht gefunden oder Klasseninhalt (Klassen-Dialoge können nicht öffentlich geteilt werden).',
        })
        return
      }
      res.json({ dialog, shareToken: dialog.shareToken ?? null })
      return
    }

    if (route === 'folder-share' && req.method === 'POST') {
      const user = await requireAuth(req)
      await requireRole(user.uid, ['teacher', 'master'])
      const { id, enabled } = req.body as { id?: string; enabled?: boolean }
      if (!id) {
        res.status(400).json({ error: 'Ordner-ID fehlt.' })
        return
      }
      const result = await setFolderSharing(id, user.uid, enabled !== false)
      if (!result) {
        res.status(404).json({
          error: 'Persönlicher Ordner nicht gefunden.',
        })
        return
      }
      res.json(result)
      return
    }

    if (route === 'dialog-clone' && req.method === 'POST') {
      const user = await requireAuth(req)
      await requireRole(user.uid, ['teacher', 'master'])
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
      if (source.userId === user.uid) {
        res.status(400).json({ error: 'Das ist dein eigener Dialog.' })
        return
      }
      const dialog = await cloneDialog(source, user.uid, folderId ?? null)
      res.status(201).json({ dialog })
      return
    }

    if (route === 'library' && req.method === 'GET') {
      const user = await requireAuth(req)
      const profile = await requireProfile(user.uid)
      const library = await loadLibraryForUser(profile)
      res.json(library)
      return
    }

    if (route === 'classes') {
      const user = await requireAuth(req)
      const profile = await requireRole(user.uid, ['teacher', 'master'])
      if (req.method === 'GET') {
        const classes = await listClassesForTeacher(profile.id)
        res.json({ classes })
        return
      }
      if (req.method === 'POST') {
        const { name } = req.body as { name?: string }
        if (!name?.trim()) {
          res.status(400).json({ error: 'Klassenname fehlt.' })
          return
        }
        const classroom = await createClass(profile.id, name)
        res.status(201).json({ class: classroom })
        return
      }
      methodNotAllowed(res)
      return
    }

    if (route === 'class') {
      const user = await requireAuth(req)
      const profile = await requireRole(user.uid, ['teacher', 'master'])
      const id = (req.query.id ?? (req.body as { id?: string })?.id) as string
      if (!id) {
        res.status(400).json({ error: 'ID fehlt.' })
        return
      }
      if (req.method === 'DELETE') {
        const ok = await deleteClass(id, profile.id, profile.role === 'master')
        if (!ok) {
          res.status(404).json({ error: 'Klasse nicht gefunden.' })
          return
        }
        res.json({ ok: true })
        return
      }
      methodNotAllowed(res)
      return
    }

    if (route === 'class-students') {
      const user = await requireAuth(req)
      const profile = await requireRole(user.uid, ['teacher', 'master'])
      const classId = (req.query.classId ??
        (req.body as { classId?: string })?.classId) as string
      if (!classId) {
        res.status(400).json({ error: 'classId fehlt.' })
        return
      }
      if (req.method === 'GET') {
        const students = await listStudentCodes(
          classId,
          profile.id,
          profile.role === 'master',
        )
        res.json({ students })
        return
      }
      if (req.method === 'POST') {
        const { label } = req.body as { label?: string }
        const student = await createStudentCode(
          classId,
          profile.id,
          label,
          profile.role === 'master',
        )
        res.status(201).json({ student })
        return
      }
      methodNotAllowed(res)
      return
    }

    if (route === 'class-student') {
      const user = await requireAuth(req)
      const profile = await requireRole(user.uid, ['teacher', 'master'])
      const code = (req.query.code ??
        (req.body as { code?: string })?.code) as string
      if (!code?.trim()) {
        res.status(400).json({ error: 'Code fehlt.' })
        return
      }
      if (req.method === 'DELETE') {
        const ok = await deleteStudentCode(
          code,
          profile.id,
          profile.role === 'master',
        )
        if (!ok) {
          res.status(404).json({ error: 'Schülercode nicht gefunden.' })
          return
        }
        res.json({ ok: true })
        return
      }
      methodNotAllowed(res)
      return
    }

    if (route === 'dialog-copy-to-class' && req.method === 'POST') {
      const user = await requireAuth(req)
      const profile = await requireProfile(user.uid)
      const { dialogId, classId, folderId } = req.body as {
        dialogId?: string
        classId?: string
        folderId?: string | null
      }
      if (!dialogId || !classId) {
        res.status(400).json({ error: 'dialogId und classId fehlen.' })
        return
      }
      const classroom = await getClass(classId)
      if (!classroom) {
        res.status(404).json({ error: 'Klasse nicht gefunden.' })
        return
      }
      const canAccess =
        profile.role === 'master' ||
        classroom.teacherId === profile.id ||
        profile.classIds.includes(classId)
      if (!canAccess) {
        throw new HttpError('Keine Berechtigung für diese Klasse.', 403)
      }
      const source = await getDialog(dialogId, user.uid, profile)
      if (!source) {
        res.status(404).json({ error: 'Dialog nicht gefunden.' })
        return
      }
      const targetFolderId = folderId ?? classroom.rootFolderId
      await assertClassFolderAccess(
        targetFolderId,
        profile.id,
        profile.role,
        profile.classIds,
        'read',
      )
      const dialog = await cloneDialog(source, user.uid, targetFolderId)
      res.status(201).json({ dialog })
      return
    }

    if (route === 'billing/status' && req.method === 'GET') {
      const user = await requireAuth(req)
      const profile = await getUserProfile(user.uid)
      if (!profile) throw new HttpError('Profil nicht gefunden.', 401)
      res.json({
        user: await enrichClientUser(profile),
        client: profileToClientUser(profile),
        stripeConfigured: isStripeConfigured(),
        priceCents: PRO_PRICE_CENTS,
        subscriptionStatus: profile.subscriptionStatus,
        proActive: isProActive(profile.role, profile.subscriptionStatus),
      })
      return
    }

    if (route === 'billing/checkout' && req.method === 'POST') {
      const user = await requireAuth(req)
      const profile = await requireRole(user.uid, ['teacher', 'master'])
      const { successUrl, cancelUrl } = req.body as {
        successUrl?: string
        cancelUrl?: string
      }
      if (!successUrl?.trim() || !cancelUrl?.trim()) {
        res.status(400).json({ error: 'successUrl und cancelUrl fehlen.' })
        return
      }
      const session = await createProCheckoutSession({
        uid: profile.id,
        email: profile.email,
        successUrl: successUrl.trim(),
        cancelUrl: cancelUrl.trim(),
      })
      res.json(session)
      return
    }

    if (route === 'billing/confirm' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { sessionId } = req.body as { sessionId?: string }
      if (!sessionId?.trim()) {
        res.status(400).json({ error: 'sessionId fehlt.' })
        return
      }
      await confirmCheckoutSession(sessionId.trim(), user.uid)
      const profile = await requireProfile(user.uid)
      res.json({ user: await enrichClientUser(profile) })
      return
    }

    if (route === 'billing/dev-unlock' && req.method === 'POST') {
      const user = await requireAuth(req)
      const profile = await requireRole(user.uid, ['master'])
      await unlockProManually(profile.id)
      const updated = await requireProfile(profile.id)
      res.json({ user: await enrichClientUser(updated) })
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
        if (parentId) {
          const parent = await getFolder(parentId)
          if (parent?.scope === 'class') {
            const profile = await requireProfile(user.uid)
            await assertClassFolderAccess(
              parentId,
              profile.id,
              profile.role,
              profile.classIds,
              'manage',
            )
          }
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
      const existing = await getFolder(id)
      if (!existing) {
        res.status(404).json({ error: 'Ordner nicht gefunden.' })
        return
      }
      const profile = await requireProfile(user.uid)
      if (existing.scope === 'class') {
        await assertClassFolderAccess(
          id,
          profile.id,
          profile.role,
          profile.classIds,
          'manage',
        )
      } else if (existing.userId !== user.uid) {
        throw new HttpError('Keine Berechtigung.', 403)
      }

      if (req.method === 'PATCH') {
        const { name, parentId } = req.body as {
          name?: string
          parentId?: string | null
        }
        try {
          const folder = await updateFolder(id, { name, parentId })
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
        try {
          const ok = await deleteFolder(id)
          if (!ok) {
            res.status(404).json({ error: 'Ordner nicht gefunden.' })
            return
          }
          res.json({ ok: true })
        } catch (err) {
          res.status(400).json({
            error: err instanceof Error ? err.message : 'Ordner konnte nicht gelöscht werden.',
          })
        }
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
        const profile = await requireProfile(user.uid)
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
        if (folderId) {
          const folder = await getFolder(folderId)
          if (folder?.scope === 'class') {
            await assertClassFolderAccess(
              folderId,
              profile.id,
              profile.role,
              profile.classIds,
              'read',
            )
          }
        }
        await consumeQuota(profile, 'dialogCreates')
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
      const profile = await requireProfile(user.uid)
      const id =
        route.startsWith('dialogs/')
          ? route.slice('dialogs/'.length)
          : ((req.query.id ?? (req.body as { id?: string })?.id) as string)
      if (!id) {
        res.status(400).json({ error: 'ID fehlt.' })
        return
      }
      if (req.method === 'GET') {
        const dialog = await getDialog(id, user.uid, profile)
        if (!dialog) {
          res.status(404).json({ error: 'Dialog nicht gefunden.' })
          return
        }
        res.json({ dialog })
        return
      }
      if (req.method === 'PATCH') {
        const dialog = await updateDialog(id, user.uid, req.body, profile)
        if (!dialog) {
          res.status(404).json({ error: 'Dialog nicht gefunden.' })
          return
        }
        res.json({ dialog })
        return
      }
      if (req.method === 'DELETE') {
        const ok = await deleteDialog(id, user.uid, profile)
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
      await gateAi(user.uid)
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
      const profile = await requireProfile(user.uid)
      const dialogId = req.query.dialogId as string | undefined
      const lineId = req.query.lineId as string | undefined
      if (!dialogId || !lineId) {
        res.status(400).json({ error: 'dialogId und lineId fehlen.' })
        return
      }
      try {
        const dialog = await getDialog(dialogId, user.uid, profile)
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
      const profile = await requireProfile(user.uid)
      const dialogId = req.query.dialogId as string | undefined
      const lineId = req.query.lineId as string | undefined
      if (!dialogId || !lineId) {
        res.status(400).json({ error: 'dialogId und lineId fehlen.' })
        return
      }
      try {
        const dialog = await getDialog(dialogId, user.uid, profile)
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
      const profile = await gateAi(user.uid)
      await consumeQuota(profile, 'slideshowPreps')
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
      await gateAi(user.uid)
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
    if (
      (route === 'visual-brief' || route === 'ai/visual-brief') &&
      req.method === 'POST'
    ) {
      return handleVisualBrief(req, res)
    }
    if (
      (route === 'visual-test' || route === 'ai/visual-test') &&
      req.method === 'POST'
    ) {
      return handleVisualTest(req, res)
    }
    if (
      (route === 'visual-critic' || route === 'ai/visual-critic') &&
      req.method === 'POST'
    ) {
      return handleVisualCritic(req, res)
    }

    // --- Story Asset Generation ---
    if (route === 'story-generate-scene' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { description } = req.body as { description?: string }
      if (!description?.trim()) {
        res.status(400).json({ error: 'Szenenbeschreibung fehlt.' })
        return
      }
      const result = await generateStoryScene(description.trim())
      res.json(result)
      return
    }

    if (route === 'story-generate-character' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { description, name } = req.body as { description?: string; name?: string }
      if (!description?.trim() || !name?.trim()) {
        res.status(400).json({ error: 'Name und Beschreibung fehlen.' })
        return
      }
      const result = await generateStoryCharacter(description.trim(), name.trim())
      res.json(result)
      return
    }

    if (route === 'story-generate-environment' && req.method === 'POST') {
      const user = await requireAuth(req)
      const { description, name } = req.body as { description?: string; name?: string }
      if (!description?.trim() || !name?.trim()) {
        res.status(400).json({ error: 'Name und Beschreibung fehlen.' })
        return
      }
      const result = await generateStoryEnvironment(description.trim(), name.trim())
      res.json(result)
      return
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
