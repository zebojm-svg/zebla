import {
  clientTimeoutMessage,
  DEFAULT_API_TIMEOUT_MS,
  FILM_PLAN_TIMEOUT_MS,
} from '../../shared/api-timeout'

const API_BASE = '/api'

export { FILM_PLAN_TIMEOUT_MS }

let tokenGetter: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (tokenGetter) {
    const token = await tokenGetter()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(clientTimeoutMessage(path, 'abort'))
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  if (!text) {
    throw new Error(`Leere Antwort vom Server (${res.status}).`)
  }
  if (text.includes('FUNCTION_INVOCATION_TIMEOUT')) {
    throw new Error(clientTimeoutMessage(path, 'server'))
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(
      text.slice(0, 300) || `Server-Fehler (${res.status}). Bitte später erneut versuchen.`,
    )
  }
  if (!res.ok) {
    const err = data as { error?: string }
    throw new Error(
      err.error ?? `Anfrage fehlgeschlagen (${res.status}). Prüfe GEMINI_API_KEY auf Vercel.`,
    )
  }
  return data as T
}

async function requestBlob(path: string, timeoutMs = 120_000): Promise<Blob> {
  const headers: Record<string, string> = {}
  if (tokenGetter) {
    const token = await tokenGetter()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Download-Zeitlimit überschritten. Bitte erneut versuchen.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text()
    let message = `Download fehlgeschlagen (${res.status}).`
    try {
      const data = JSON.parse(text) as { error?: string }
      if (data.error) message = data.error
    } catch {
      if (text) message = text.slice(0, 200)
    }
    throw new Error(message)
  }
  return res.blob()
}

export const api = {
  auth: {
    student: (code: string, name?: string, classCode?: string) =>
      request<{ customToken: string; user: import('../types').User }>('/student-login', {
        method: 'POST',
        body: JSON.stringify({ code, studentCode: code, name, classCode }),
      }),
    sync: (name?: string) =>
      request<{ user: import('../types').User }>('/sync', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  library: {
    list: () =>
      request<{
        folders: import('../types').DialogFolder[]
        dialogs: import('../types').Dialog[]
        classes: import('../types').ClassRoom[]
      }>('/library'),
  },
  classes: {
    list: () => request<{ classes: import('../types').ClassRoom[] }>('/classes'),
    create: (name: string) =>
      request<{ class: import('../types').ClassRoom }>('/classes', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/class?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    listStudents: (classId: string) =>
      request<{ students: import('../types').StudentCodeInfo[] }>(
        `/class-students?classId=${encodeURIComponent(classId)}`,
      ),
    createStudent: (classId: string, label?: string) =>
      request<{ student: import('../types').StudentCodeInfo }>('/class-students', {
        method: 'POST',
        body: JSON.stringify({ classId, label }),
      }),
    deleteStudent: (code: string) =>
      request<{ ok: boolean }>(`/class-student?code=${encodeURIComponent(code)}`, {
        method: 'DELETE',
      }),
  },
  billing: {
    status: () =>
      request<{
        user: import('../types').User
        stripeConfigured: boolean
        priceCents: number
      }>('/billing/status'),
    checkout: (successUrl?: string, cancelUrl?: string) =>
      request<{ url: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ successUrl, cancelUrl }),
      }),
    confirm: (sessionId: string) =>
      request<{ user: import('../types').User }>('/billing/confirm', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      }),
    devUnlock: (userId?: string) =>
      request<{ user: import('../types').User }>('/billing/dev-unlock', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
  },
  folders: {
    create: (name: string, parentId?: string | null) =>
      request<{ folder: import('../types').DialogFolder }>('/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parentId: parentId ?? null }),
      }),
    update: (id: string, data: { name?: string; parentId?: string | null }) =>
      request<{ folder: import('../types').DialogFolder }>('/folder', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...data }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/folder?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    setSharing: (id: string, enabled: boolean) =>
      request<{ updated: number; dialogs: import('../types').Dialog[] }>('/folder-share', {
        method: 'POST',
        body: JSON.stringify({ id, enabled }),
      }),
  },
  dialogs: {
    list: () => request<{ dialogs: import('../types').Dialog[] }>('/dialogs'),
    get: (id: string) =>
      request<{ dialog: import('../types').Dialog }>(`/dialog?id=${encodeURIComponent(id)}`),
    create: (data: {
      title: string
      sourceLanguage: string
      targetLanguage: string
      length: import('../types').DialogLength
      sections: import('../types').DialogSection[]
      folderId?: string | null
      creationMode?: import('../types').CreateMode
      creationPrompt?: string
      creationChat?: import('../types').ChatMessage[]
      imageDirection?: string
      filmPrompt?: string
      soundDirection?: string
      speechDirection?: string
    }) =>
      request<{ dialog: import('../types').Dialog }>('/dialogs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<import('../types').Dialog>) =>
      request<{ dialog: import('../types').Dialog }>('/dialog', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...data }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/dialog?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    setSharing: (id: string, enabled: boolean) =>
      request<{ dialog: import('../types').Dialog; shareToken: string | null }>(
        '/dialog-share',
        {
          method: 'POST',
          body: JSON.stringify({ id, enabled }),
        },
      ),
    cloneFromShare: (token: string, folderId?: string | null) =>
      request<{ dialog: import('../types').Dialog }>('/dialog-clone', {
        method: 'POST',
        body: JSON.stringify({ token, folderId: folderId ?? null }),
      }),
    copyToClass: (dialogId: string, classId: string, folderId?: string | null) =>
      request<{ dialog: import('../types').Dialog }>('/dialog-copy-to-class', {
        method: 'POST',
        body: JSON.stringify({ dialogId, classId, folderId: folderId ?? null }),
      }),
  },
  shared: {
    get: (token: string) =>
      request<{
        dialog: Pick<
          import('../types').Dialog,
          'title' | 'sourceLanguage' | 'targetLanguage' | 'length' | 'sections'
        >
      }>(`/shared?token=${encodeURIComponent(token)}`),
  },
  tts: {
    status: (languageCode?: string) =>
      request<{ configured: boolean; working: boolean; provider: string; error?: string }>(
        `/tts-status${languageCode ? `?lang=${encodeURIComponent(languageCode)}` : ''}`,
      ),
    getOrCreate: (data: { dialogId: string; lineId: string; rate?: number }) =>
      request<{ audioUrl: string; cached: boolean; dialog: import('../types').Dialog }>(
        '/tts',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      ),
    ensureAll: (dialogId: string, rate?: number, options?: { force?: boolean }) =>
      request<{
        dialog: import('../types').Dialog
        generated: number
        skipped: number
      }>('/dialog-ensure-audio', {
        method: 'POST',
        body: JSON.stringify({ dialogId, rate, force: options?.force === true }),
      }),
    regenerateSpeaker: (dialogId: string, speaker: string) =>
      request<{ dialog: import('../types').Dialog; generated: number }>(
        '/dialog-regenerate-speaker-audio',
        {
          method: 'POST',
          body: JSON.stringify({ dialogId, speaker }),
        },
        300_000,
      ),
    lineAudio: (dialogId: string, lineId: string) =>
      requestBlob(
        `/dialog-audio-line?dialogId=${encodeURIComponent(dialogId)}&lineId=${encodeURIComponent(lineId)}`,
      ),
    exportZip: (dialogId: string) =>
      requestBlob(
        `/dialog-audio-export?dialogId=${encodeURIComponent(dialogId)}&format=zip`,
        180_000,
      ),
    lineImage: (dialogId: string, lineId: string) =>
      requestBlob(
        `/dialog-image?dialogId=${encodeURIComponent(dialogId)}&lineId=${encodeURIComponent(lineId)}`,
        60_000,
      ),
  },
  ai: {
    status: () => request<{ configured: boolean }>('/ai-status'),
    topic: (
      topic: string,
      targetLanguage: string,
      length: import('../types').DialogLength,
    ) =>
      request<{ title: string; sections: import('../types').DialogSection[] }>('/topic', {
        method: 'POST',
        body: JSON.stringify({ topic, targetLanguage, length }),
      }),
    sentences: (
      sentences: string[],
      targetLanguage: string,
      length: import('../types').DialogLength,
    ) =>
      request<{ title: string; sections: import('../types').DialogSection[] }>('/sentences', {
        method: 'POST',
        body: JSON.stringify({ sentences, targetLanguage, length }),
      }),
    chat: (
      messages: import('../types').ChatMessage[],
      targetLanguage: string,
      length: import('../types').DialogLength,
    ) =>
      request<{
        reply: string
        dialog?: { title: string; sections: import('../types').DialogSection[] }
      }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ messages, targetLanguage, length }),
      }),
    translate: (dialogId: string, targetLanguage: string) =>
      request<{ dialog: import('../types').Dialog }>('/translate', {
        method: 'POST',
        body: JSON.stringify({ dialogId, targetLanguage }),
      }),
    filmStoryboard: (dialogId: string, cheapAi = true) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>(
        '/film-storyboard',
        {
          method: 'POST',
          body: JSON.stringify({ dialogId, cheapAi }),
        },
        FILM_PLAN_TIMEOUT_MS,
      ),
    filmStoryboardTweak: (dialogId: string, panelId: string, note: string) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>(
        '/film-storyboard-tweak',
        {
          method: 'POST',
          body: JSON.stringify({ dialogId, panelId, note }),
        },
        FILM_PLAN_TIMEOUT_MS,
      ),
    filmFromPrompt: (
      prompt: string,
      targetLanguage: string,
      mode: import('../types').FilmDraftMode,
      answers?: string,
    ) =>
      request<{
        title?: string
        sections?: import('../types').DialogSection[]
        imageDirection?: string
        soundDirection?: string
        speechDirection?: string
        questions?: string[]
      }>(
        '/film-from-prompt',
        {
          method: 'POST',
          body: JSON.stringify({ prompt, targetLanguage, mode, answers }),
        },
        FILM_PLAN_TIMEOUT_MS,
      ),
    filmStoryboardRegenerate: (dialogId: string, sceneIds: string[]) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>(
        '/film-storyboard-regenerate',
        {
          method: 'POST',
          body: JSON.stringify({ dialogId, sceneIds }),
        },
        FILM_PLAN_TIMEOUT_MS,
      ),
    filmStoryboardComment: (dialogId: string, panelId: string, comment: string) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>('/film-storyboard-comment', {
        method: 'POST',
        body: JSON.stringify({ dialogId, panelId, comment }),
      }),
    filmSceneNote: (dialogId: string, sceneId: string, noteDe: string) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>('/film-scene-note', {
        method: 'POST',
        body: JSON.stringify({ dialogId, sceneId, noteDe }),
      }),
    filmInsertPanel: (dialogId: string, afterPanelId: string, text: string) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>(
        '/film-storyboard-insert-panel',
        {
          method: 'POST',
          body: JSON.stringify({ dialogId, afterPanelId, text }),
        },
        FILM_PLAN_TIMEOUT_MS,
      ),
    filmInsertScene: (dialogId: string, afterSceneId: string | null, title: string) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>(
        '/film-storyboard-insert-scene',
        {
          method: 'POST',
          body: JSON.stringify({ dialogId, afterSceneId, title }),
        },
        FILM_PLAN_TIMEOUT_MS,
      ),
    filmSketch: (dialogId: string, panelId: string) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>(
        '/film-storyboard-sketch',
        { method: 'POST', body: JSON.stringify({ dialogId, panelId }) },
        120_000,
      ),
    filmStill: (dialogId: string, panelId: string, styleId?: string, note?: string) =>
      request<{
        dialog: import('../types').Dialog
        board: import('../../shared/film-storyboard').FilmStoryboard
      }>(
        '/film-storyboard-still',
        { method: 'POST', body: JSON.stringify({ dialogId, panelId, styleId, note }) },
        120_000,
      ),
    filmPlanSave: (
      dialogId: string,
      plan: import('../../shared/film-storyboard').FilmPlan,
    ) =>
      request<{ dialog: import('../types').Dialog }>('/film-plan', {
        method: 'POST',
        body: JSON.stringify({ dialogId, plan }),
      }),
    birkenbihl: (
      dialogId: string,
      nativeLanguage: string,
      includeRomanization?: boolean,
    ) =>
      request<{ dialog: import('../types').Dialog }>('/birkenbihl', {
        method: 'POST',
        body: JSON.stringify({ dialogId, nativeLanguage, includeRomanization }),
      }),
    split: (dialogId: string) =>
      request<{ dialog: import('../types').Dialog }>('/split', {
        method: 'POST',
        body: JSON.stringify({ dialogId }),
      }),
    image: (dialogId: string, sectionId: string) =>
      request<{ dialog: import('../types').Dialog; imageUrl: string }>('/image', {
        method: 'POST',
        body: JSON.stringify({ dialogId, sectionId }),
      }),
    imageAll: (dialogId: string) =>
      request<{ dialog: import('../types').Dialog }>('/image-all', {
        method: 'POST',
        body: JSON.stringify({ dialogId }),
      }),
    imageLines: (
      dialogId: string,
      sectionId: string,
      beatIndex: number,
      replan?: boolean,
      retry?: boolean,
      forceImages?: boolean,
    ) =>
      request<{
        dialog: import('../types').Dialog
        done: boolean
        totalBeats: number
        currentBeat: number
        reason?: string
        prepPending?: boolean
      }>('/image-lines', {
        method: 'POST',
        body: JSON.stringify({ dialogId, sectionId, beatIndex, replan, retry, forceImages }),
      }),
    visualBrief: (
      dialogId: string,
      data?: { answers?: Record<string, string>; askQuestions?: boolean },
    ) =>
      request<{
        dialog: import('../types').Dialog
        questions: import('../types').VisualQuestion[]
        brief: import('../types').VisualBrief | null
      }>('/visual-brief', {
        method: 'POST',
        body: JSON.stringify({ dialogId, ...data }),
      }),
    visualTest: (dialogId: string, data?: { comment?: string; approve?: boolean }) =>
      request<{ dialog: import('../types').Dialog }>('/visual-test', {
        method: 'POST',
        body: JSON.stringify({ dialogId, ...data }),
      }),
    visualCritic: (
      dialogId: string,
      sectionId: string,
      fromBeat: number,
      toBeat: number,
    ) =>
      request<{
        dialog: import('../types').Dialog
        ok: boolean
        notes: string
        retryBeatIndexes: number[]
      }>('/visual-critic', {
        method: 'POST',
        body: JSON.stringify({ dialogId, sectionId, fromBeat, toBeat }),
      }),
  },
  story: {
    listArtStyles: () =>
      request<{
        styles: import('../../shared/story-art-styles').StoryArtStyle[]
        defaultStyleId: import('../../shared/story-art-styles').StoryArtStyleId
      }>('/story-art-styles'),
    stillsStatus: () =>
      request<{
        lockEngine: import('../../shared/story-stills').StillsEngineId
        masterEngine: import('../../shared/story-stills').StillsEngineId
        engines: import('../../shared/story-stills').StillsEngineInfo[]
        poses: Array<{ id: string; label: string; hintDe: string }>
      }>('/story-stills-status'),
    generateScene: (description: string, styleId?: string) =>
      request<{ imageUrl: string; prompt: string; styleId: string }>('/story-generate-scene', {
        method: 'POST',
        body: JSON.stringify({ description, styleId }),
      }),
    generateCharacter: (
      name: string,
      description: string,
      styleId?: string,
      legPoseId?: string,
      headAngleId?: string,
      armPoseId?: string,
      referenceImageUrl?: string,
      faceExpressionId?: string,
      stillPoseId?: string,
    ) =>
      request<{
        imageUrl: string
        prompt: string
        styleId: string
        engine: import('../../shared/story-stills').StillsEngineId
        locked: boolean
        stillPoseId?: import('../../shared/story-stills').StillPoseId
        rig?: import('../../shared/character-rig').CharacterRig
      }>(
        '/story-generate-character',
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            description,
            styleId,
            legPoseId,
            headAngleId,
            armPoseId,
            referenceImageUrl,
            faceExpressionId,
            stillPoseId,
          }),
        },
        140_000,
      ),
    rigCharacter: (imageUrl: string, name?: string, libraryAssetId?: string) =>
      request<{
        imageUrl: string
        rig: import('../../shared/character-rig').CharacterRig
        asset: import('../../shared/story-types').StoryLibraryAsset | null
      }>(
        '/story-rig-character',
        {
          method: 'POST',
          body: JSON.stringify({ imageUrl, name, libraryAssetId }),
        },
        80_000,
      ),
    generateEnvironment: (name: string, description: string, styleId?: string) =>
      request<{ imageUrl: string; prompt: string; styleId: string }>('/story-generate-environment', {
        method: 'POST',
        body: JSON.stringify({ name, description, styleId }),
      }),
    listLibrary: (opts?: { type?: 'character' | 'environment' | 'scene'; tag?: string }) => {
      const params = new URLSearchParams()
      if (opts?.type) params.set('type', opts.type)
      if (opts?.tag) params.set('tag', opts.tag)
      const qs = params.toString()
      return request<{ assets: import('../../shared/story-types').StoryLibraryAsset[] }>(
        `/story-library${qs ? `?${qs}` : ''}`,
      )
    },
    saveToLibrary: (input: {
      type: 'character' | 'environment' | 'scene'
      name: string
      description?: string
      imageUrl: string
      tags: string[]
      styleId?: string
      legPoseId?: string
      headAngleId?: string
      armPoseId?: string
      faceExpressionId?: string
      rig?: import('../../shared/character-rig').CharacterRig
    }) =>
      request<{ asset: import('../../shared/story-types').StoryLibraryAsset }>('/story-library', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    deleteFromLibrary: (id: string) =>
      request<{ ok: boolean }>(`/story-library/${id}`, { method: 'DELETE' }),
    listPresets: () =>
      request<{ presets: import('../../shared/scene-presets').ScenePreset[] }>('/story-presets'),
  },
  publicCatalog: {
    list: (folderId?: string | null) => {
      const qs = folderId ? `?folder=${encodeURIComponent(folderId)}` : ''
      return request<{
        folders: import('../../shared/public-catalog').PublicCatalogFolder[]
        items: import('../../shared/public-catalog').PublicCatalogItem[]
        breadcrumbs: import('../../shared/public-catalog').PublicCatalogFolder[]
      }>(`/public-catalog${qs}`)
    },
    getItem: (itemId: string) =>
      request<{ item: import('../../shared/public-catalog').PublicCatalogItem }>(
        `/public-catalog?item=${encodeURIComponent(itemId)}`,
      ),
    createFolder: (input: {
      name: string
      parentId?: string | null
      sourceLanguage?: string
      targetLanguage?: string
    }) =>
      request<{ folder: import('../../shared/public-catalog').PublicCatalogFolder }>(
        '/public-catalog/folder',
        { method: 'POST', body: JSON.stringify(input) },
      ),
    deleteFolder: (id: string) =>
      request<{ ok: boolean }>(`/public-catalog/folder?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    createItem: (input: {
      folderId: string
      title: string
      description?: string
      shareToken?: string
    }) =>
      request<{ item: import('../../shared/public-catalog').PublicCatalogItem }>(
        '/public-catalog/item',
        { method: 'POST', body: JSON.stringify(input) },
      ),
    deleteItem: (id: string) =>
      request<{ ok: boolean }>(`/public-catalog/item?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    uploadSmall: (itemId: string, kind: 'thumbnail' | 'pdf', dataBase64: string) =>
      request<{ item: import('../../shared/public-catalog').PublicCatalogItem }>(
        '/public-catalog/upload',
        { method: 'POST', body: JSON.stringify({ itemId, kind, dataBase64 }) },
        120_000,
      ),
    videoUploadUrl: (itemId: string, contentType?: string) =>
      request<{ uploadUrl: string; publicUrl: string; path: string }>(
        '/public-catalog/upload-url',
        { method: 'POST', body: JSON.stringify({ itemId, kind: 'video', contentType }) },
      ),
    videoUploadComplete: (itemId: string, path: string) =>
      request<{ item: import('../../shared/public-catalog').PublicCatalogItem }>(
        '/public-catalog/upload-complete',
        { method: 'POST', body: JSON.stringify({ itemId, path }) },
      ),
    pdfUrl: (itemId: string) => `/api/public-catalog/pdf?item=${encodeURIComponent(itemId)}`,
  },
}
