import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, sendError } from './api-utils.js'
import { getDialog, updateDialog, type UserProfile } from './firestore.js'
import { requireProfile, assertCanUseAi } from './access.js'
import { consumeQuota } from './usage.js'
import { uploadDialogImage } from './image-storage.js'
import {
  generateDialogFromTopic,
  generateDialogFromSentences,
  chatForDialog,
  translateDialog,
  applyBirkenbihl,
  splitIntoSections,
  buildCharacterBible,
  planSpeakerPortraits,
  applySpeakerPortraits,
  ensureDialogVisualScript,
  ensureReferenceImage,
  generateSectionImage,
  generateUploadedImage,
  isAiConfigured,
  chatJson,
} from './ai.js'
import { buildVisualBrief, neededVisualQuestions, testImagePrompt } from './visual-director.js'
import { reviewRecentBeats } from './visual-critic.js'
import { formatCharacterBibleForPrompt } from './visual-script.js'
import type { ChatMessage, Dialog, DialogLength, DialogSection } from '../shared/types.js'

export function handleAiStatus(_req: VercelRequest, res: VercelResponse) {
  res.json({ configured: isAiConfigured() })
}

export async function handleGenerateTopic(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const { topic, targetLanguage, length } = req.body as {
      topic?: string
      targetLanguage?: string
      length?: DialogLength
    }
    if (!topic || !targetLanguage || !length) {
      res.status(400).json({ error: 'Pflichtfelder fehlen.' })
      return
    }
    const result = await generateDialogFromTopic(topic, targetLanguage, length)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleGenerateSentences(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const { sentences, targetLanguage, length } = req.body as {
      sentences?: string[]
      targetLanguage?: string
      length?: DialogLength
    }
    if (!sentences?.length || !targetLanguage || !length) {
      res.status(400).json({ error: 'Pflichtfelder fehlen.' })
      return
    }
    const result = await generateDialogFromSentences(sentences, targetLanguage, length)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleGenerateChat(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const { messages, targetLanguage, length } = req.body as {
      messages?: ChatMessage[]
      targetLanguage?: string
      length?: DialogLength
    }
    if (!messages?.length || !targetLanguage || !length) {
      res.status(400).json({ error: 'Pflichtfelder fehlen.' })
      return
    }
    const result = await chatForDialog(messages, targetLanguage, length)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
}

function dialogIdFromRequest(req: VercelRequest, body: { dialogId?: string }): string | undefined {
  return body.dialogId ?? (req.query.dialogId as string | undefined)
}

async function ensureCharacterBibleOnDialog(
  dialog: Dialog,
  userId: string,
  profile?: UserProfile | null,
): Promise<Dialog> {
  let current = dialog
  if (!current.characterBible?.length) {
    const characterBible = await buildCharacterBible(current)
    const updated = await updateDialog(current.id, userId, { characterBible }, profile)
    current = updated ?? { ...current, characterBible }
  }
  if (!current.speakerVoices || !Object.keys(current.speakerVoices).length) {
    const { buildSpeakerVoiceProfiles, mergeVoiceProfilesIntoDialog } = await import(
      './speaker-voice.js'
    )
    const profiles = buildSpeakerVoiceProfiles(current)
    const merged = mergeVoiceProfilesIntoDialog(current, profiles)
    const updated = await updateDialog(current.id, userId, merged, profile)
    current = updated ?? { ...current, ...merged }
  }
  return current
}

async function attachSectionImage(
  dialog: Dialog,
  section: DialogSection,
  userId: string,
  profile?: UserProfile | null,
) {
  const withBible = await ensureCharacterBibleOnDialog(dialog, userId, profile)
  const { imageUrl: dataUrl, prompt } = await generateSectionImage(
    section,
    withBible.title,
    withBible.characterBible,
  )
  let imageUrl = dataUrl
  try {
    imageUrl = await uploadDialogImage(dataUrl, dialog.id, section.id)
  } catch (storageErr) {
    console.warn('Storage-Upload fehlgeschlagen, nutze Data-URL:', storageErr)
  }
  const sections = dialog.sections.map((s) =>
    s.id === section.id ? { ...s, imageUrl, imagePrompt: prompt } : s,
  )
  const updated = await updateDialog(
    dialog.id,
    userId,
    {
      sections,
      characterBible: withBible.characterBible,
    },
    profile,
  )
  return { updated, imageUrl, sectionId: section.id }
}

export async function handleTranslate(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const body = req.body as { dialogId?: string; targetLanguage?: string }
    const dialogId = dialogIdFromRequest(req, body)
    const { targetLanguage } = body
    if (!dialogId || !targetLanguage) {
      res.status(400).json({ error: 'dialogId und Zielsprache fehlen.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const allLines = dialog.sections.flatMap((s) => s.lines)
    const translated = await translateDialog(allLines, targetLanguage)
    let offset = 0
    const sections = dialog.sections.map((sec) => {
      const lines = translated.slice(offset, offset + sec.lines.length)
      offset += sec.lines.length
      return { ...sec, lines }
    })
    const updated = await updateDialog(
      dialog.id,
      user.uid,
      { targetLanguage, sections },
      profile,
    )
    res.json({ dialog: updated })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleBirkenbihl(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const body = req.body as {
      dialogId?: string
      nativeLanguage?: string
      includeRomanization?: boolean
    }
    const dialogId = dialogIdFromRequest(req, body)
    const { nativeLanguage, includeRomanization } = body
    if (!dialogId || !nativeLanguage) {
      res.status(400).json({ error: 'dialogId und Muttersprache fehlen.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const sections = []
    for (const sec of dialog.sections) {
      const lines = await applyBirkenbihl(
        sec.lines,
        nativeLanguage,
        dialog.targetLanguage,
        includeRomanization !== false,
      )
      sections.push({ ...sec, lines })
    }
    const updated = await updateDialog(
      dialog.id,
      user.uid,
      {
        sourceLanguage: nativeLanguage,
        sections,
      },
      profile,
    )
    res.json({ dialog: updated })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleSplit(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const body = req.body as { dialogId?: string }
    const dialogId = dialogIdFromRequest(req, body)
    if (!dialogId) {
      res.status(400).json({ error: 'dialogId fehlt.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const allLines = dialog.sections.flatMap((s) => s.lines)
    const sections = await splitIntoSections(allLines)
    const updated = await updateDialog(dialog.id, user.uid, { sections }, profile)
    res.json({ dialog: updated })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleImageLines(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const body = req.body as {
      dialogId?: string
      sectionId?: string
      beatIndex?: number
      replan?: boolean
      retry?: boolean
    }
    const dialogId = dialogIdFromRequest(req, body)
    const sectionId = body.sectionId
    if (!dialogId || !sectionId) {
      res.status(400).json({ error: 'dialogId und sectionId fehlen.' })
      return
    }
    let dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const section = dialog.sections.find((s) => s.id === sectionId)
    if (!section) {
      res.status(404).json({ error: 'Abschnitt nicht gefunden.' })
      return
    }

    dialog = await ensureCharacterBibleOnDialog(dialog, user.uid, profile)

    if (!dialog.visualScript?.beats?.length || body.replan) {
      if (body.replan) {
        const cleared = await updateDialog(
          dialog.id,
          user.uid,
          {
            visualScript: { version: 1, scenes: [], beats: [] },
            ...(dialog.visualBrief?.testApproved
              ? {}
              : { referenceImageUrl: '', referenceImagePrompt: '' }),
          },
          profile,
        )
        if (cleared) dialog = cleared
      }
      const script = await ensureDialogVisualScript(dialog)
      const withScript = await updateDialog(
        dialog.id,
        user.uid,
        { visualScript: script },
        profile,
      )
      dialog = withScript ?? { ...dialog, visualScript: script }
    }

    dialog = await ensureReferenceImage(
      dialog,
      user.uid,
      body.replan === true && !dialog.visualBrief?.testApproved,
    )

    if (body.beatIndex === -1) {
      res.json({
        dialog,
        done: false,
        totalBeats: dialog.visualScript?.beats.filter((b) => b.sectionId === section.id).length ?? 0,
        currentBeat: 0,
        reason: 'Referenz-Cast (intern)',
      })
      return
    }

    let beats = dialog.visualScript!.beats.filter((b) => b.sectionId === section.id)
    if (!beats.length) {
      const portraits = await planSpeakerPortraits(section, dialog)
      beats = portraits.map((p) => ({
        id: p.id,
        sectionId: section.id,
        lineIndices: p.lineIndices,
        sceneId: 'main',
        activeSpeaker: p.speaker,
        addressee: p.addressee ?? '',
        mood: p.mood,
        gaze: p.gaze,
        framing: p.framing,
        newSetup: true,
        cameraEn: `beside ${p.addressee ?? 'partner'} watching ${p.speaker}`,
        expressionEn: p.mood,
        prompt: p.prompt,
        imageUrl: p.imageUrl,
        reason: p.reason,
      }))
    }

    const beatIndex = body.beatIndex ?? 0
    if (!beats.length) {
      res.status(400).json({ error: 'Kein Bilderskript geplant.' })
      return
    }
    if (beatIndex >= beats.length) {
      res.json({
        dialog,
        done: true,
        totalBeats: beats.length,
        currentBeat: beats.length,
      })
      return
    }

    const beat = beats[beatIndex]
    if (!beat.imageUrl || body.retry) {
      const storageKey = `${section.id}-beat-${beat.id.replace(/[^\w\-]+/g, '_').slice(0, 48)}${body.retry ? '-r' : ''}`
      const imageUrl = await generateUploadedImage(
        beat.prompt,
        dialog.id,
        storageKey,
        dialog.characterBible,
        dialog.referenceImagePrompt,
        dialog.visualBrief,
      )
      beats = beats.map((b, i) => (i === beatIndex ? { ...b, imageUrl } : b))
    }

    const allBeats = dialog.visualScript!.beats.map((b) =>
      b.sectionId === section.id ? (beats.find((x) => x.id === b.id) ?? b) : b,
    )
    const visualScript = { ...dialog.visualScript!, beats: allBeats }
    const portraits = beats.map((b) => ({
      id: b.id,
      speaker: b.activeSpeaker,
      mood: b.mood,
      gaze: b.gaze,
      addressee: b.addressee,
      lineIndices: b.lineIndices,
      framing: b.framing,
      prompt: b.prompt,
      imageUrl: b.imageUrl,
      reason: b.reason,
    }))
    const lines = applySpeakerPortraits(section.lines, portraits)
    const sections = dialog.sections.map((s) =>
      s.id === section.id
        ? {
            ...s,
            lines,
            speakerPortraits: portraits,
            lineImageBeats: undefined,
            imageUrl: portraits.find((p) => p.imageUrl)?.imageUrl ?? s.imageUrl,
          }
        : s,
    )
    const updated = await updateDialog(
      dialog.id,
      user.uid,
      {
        sections,
        characterBible: dialog.characterBible,
        visualScript,
      },
      profile,
    )
    const done = beatIndex + 1 >= beats.length
    res.json({
      dialog: updated,
      done,
      totalBeats: beats.length,
      currentBeat: beatIndex + 1,
      reason: beat.reason ?? `${beat.activeSpeaker} (${beat.mood})`,
    })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleImageAll(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const body = req.body as { dialogId?: string; sectionId?: string }
    if (!body.sectionId) {
      res.status(400).json({
        error: 'Bitte Bilder einzeln generieren (ein Abschnitt pro Anfrage).',
      })
      return
    }
    // Quota bereits oben verbraucht – restliche Logik wie handleImage ohne erneutes Gating
    const dialogId = dialogIdFromRequest(req, body)
    const sectionId = body.sectionId ?? (req.query.sectionId as string | undefined)
    if (!dialogId || !sectionId) {
      res.status(400).json({ error: 'dialogId und sectionId fehlen.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const section = dialog.sections.find((s) => s.id === sectionId)
    if (!section) {
      res.status(404).json({ error: 'Abschnitt nicht gefunden.' })
      return
    }
    const { updated, imageUrl, sectionId: sid } = await attachSectionImage(
      dialog,
      section,
      user.uid,
      profile,
    )
    res.json({ dialog: updated, imageUrl, sectionId: sid })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleImage(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const body = req.body as { dialogId?: string; sectionId?: string }
    const dialogId = dialogIdFromRequest(req, body)
    const sectionId = body.sectionId ?? (req.query.sectionId as string | undefined)
    if (!dialogId || !sectionId) {
      res.status(400).json({ error: 'dialogId und sectionId fehlen.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const section = dialog.sections.find((s) => s.id === sectionId)
    if (!section) {
      res.status(404).json({ error: 'Abschnitt nicht gefunden.' })
      return
    }
    const { updated, imageUrl, sectionId: sid } = await attachSectionImage(
      dialog,
      section,
      user.uid,
      profile,
    )
    res.json({ dialog: updated, imageUrl, sectionId: sid })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleVisualBrief(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    const body = req.body as {
      dialogId?: string
      answers?: Record<string, string>
      askQuestions?: boolean
    }
    const dialogId = dialogIdFromRequest(req, body)
    if (!dialogId) {
      res.status(400).json({ error: 'dialogId fehlt.' })
      return
    }
    const dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }

    const ask = body.askQuestions !== false
    const questions = ask ? neededVisualQuestions(dialog, body.answers) : []
    if (questions.length) {
      res.json({ dialog, questions, brief: null })
      return
    }

    await consumeQuota(profile, 'aiCalls')
    const brief = await buildVisualBrief(dialog, chatJson, body.answers)
    const updated = await updateDialog(
      dialog.id,
      user.uid,
      {
        visualBrief: brief,
        characterBible: [],
        visualScript: { version: 1, scenes: [], beats: [] },
        referenceImageUrl: brief.testImageUrl,
        referenceImagePrompt: brief.testApproved ? brief.directorPromptEn : undefined,
      },
      profile,
    )
    res.json({ dialog: updated ?? { ...dialog, visualBrief: brief }, questions: [], brief })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleVisualTest(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const body = req.body as {
      dialogId?: string
      comment?: string
      approve?: boolean
    }
    const dialogId = dialogIdFromRequest(req, body)
    if (!dialogId) {
      res.status(400).json({ error: 'dialogId fehlt.' })
      return
    }
    let dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    if (!dialog.visualBrief) {
      const brief = await buildVisualBrief(dialog, chatJson)
      const withBrief = await updateDialog(dialog.id, user.uid, { visualBrief: brief }, profile)
      dialog = withBrief ?? { ...dialog, visualBrief: brief }
    }

    if (body.approve) {
      const visualBrief = { ...dialog.visualBrief!, testApproved: true }
      const updated = await updateDialog(
        dialog.id,
        user.uid,
        {
          visualBrief,
          referenceImageUrl: visualBrief.testImageUrl,
          referenceImagePrompt: visualBrief.directorPromptEn,
        },
        profile,
      )
      res.json({ dialog: updated ?? { ...dialog, visualBrief } })
      return
    }

    dialog = await ensureCharacterBibleOnDialog(dialog, user.uid, profile)
    const extra = body.comment?.trim()
    const visualBrief = {
      ...dialog.visualBrief!,
      extraConstraintsEn: extra
        ? [dialog.visualBrief?.extraConstraintsEn, extra].filter(Boolean).join(' ')
        : dialog.visualBrief?.extraConstraintsEn,
      testApproved: false,
    }
    const bibleNote = dialog.characterBible
      ? formatCharacterBibleForPrompt(dialog.characterBible)
      : ''
    const prompt = testImagePrompt({ ...dialog, visualBrief }, bibleNote)
    const imageUrl = await generateUploadedImage(
      prompt,
      dialog.id,
      extra ? `visual-test-${Date.now()}` : 'visual-test',
      dialog.characterBible,
      undefined,
      visualBrief,
    )
    visualBrief.testImageUrl = imageUrl
    const updated = await updateDialog(
      dialog.id,
      user.uid,
      {
        visualBrief,
        characterBible: dialog.characterBible,
        referenceImageUrl: imageUrl,
        referenceImagePrompt: prompt,
      },
      profile,
    )
    res.json({ dialog: updated ?? { ...dialog, visualBrief } })
  } catch (err) {
    sendError(res, err)
  }
}

export async function handleVisualCritic(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireAuth(req)
    const profile = await requireProfile(user.uid)
    assertCanUseAi(profile)
    await consumeQuota(profile, 'aiCalls')
    const body = req.body as {
      dialogId?: string
      sectionId?: string
      fromBeat?: number
      toBeat?: number
    }
    const dialogId = dialogIdFromRequest(req, body)
    if (!dialogId || !body.sectionId) {
      res.status(400).json({ error: 'dialogId und sectionId fehlen.' })
      return
    }
    let dialog = await getDialog(dialogId, user.uid, profile)
    if (!dialog) {
      res.status(404).json({ error: 'Dialog nicht gefunden.' })
      return
    }
    const fromBeat = Math.max(0, body.fromBeat ?? 0)
    const toBeat = body.toBeat ?? fromBeat
    const critic = await reviewRecentBeats(dialog, body.sectionId, fromBeat, toBeat)

    if (dialog.visualBrief && (critic.extraConstraintsEn || critic.notes)) {
      const visualBrief = {
        ...dialog.visualBrief,
        extraConstraintsEn: [dialog.visualBrief.extraConstraintsEn, critic.extraConstraintsEn]
          .filter(Boolean)
          .join(' ')
          .slice(0, 1200),
        criticNotesEn: critic.notes || dialog.visualBrief.criticNotesEn,
      }
      const updated = await updateDialog(dialog.id, user.uid, { visualBrief }, profile)
      dialog = updated ?? { ...dialog, visualBrief }
    }

    res.json({
      dialog,
      ok: critic.ok,
      notes: critic.notes,
      retryBeatIndexes: critic.retryBeatIndexes,
    })
  } catch (err) {
    sendError(res, err)
  }
}

