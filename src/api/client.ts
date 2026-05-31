const API_BASE = '/api'

let tokenGetter: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 55_000,
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
      throw new Error(
        'Zeitlimit überschritten (60 s). Bitte nur ein Bild auf einmal generieren.',
      )
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
    throw new Error(
      'Server-Zeitlimit überschritten. Bitte nur ein einzelnes Bild generieren und erneut versuchen.',
    )
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

export const api = {
  auth: {
    student: (code: string, name?: string) =>
      request<{ customToken: string; user: import('../types').User }>('/student-login', {
        method: 'POST',
        body: JSON.stringify({ code, name }),
      }),
    sync: (name?: string) =>
      request<{ user: import('../types').User }>('/sync', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  library: {
    list: () =>
      request<{ folders: import('../types').DialogFolder[]; dialogs: import('../types').Dialog[] }>(
        '/library',
      ),
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
    birkenbihl: (dialogId: string, nativeLanguage: string) =>
      request<{ dialog: import('../types').Dialog }>('/birkenbihl', {
        method: 'POST',
        body: JSON.stringify({ dialogId, nativeLanguage }),
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
    ) =>
      request<{
        dialog: import('../types').Dialog
        done: boolean
        totalBeats: number
        currentBeat: number
        reason?: string
      }>('/image-lines', {
        method: 'POST',
        body: JSON.stringify({ dialogId, sectionId, beatIndex, replan }),
      }),
  },
}
