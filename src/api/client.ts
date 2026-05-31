const API_BASE = '/api'

let tokenGetter: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (tokenGetter) {
    const token = await tokenGetter()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const text = await res.text()
  if (!text) {
    throw new Error(`Leere Antwort vom Server (${res.status}).`)
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
      request<{ customToken: string; user: import('../types').User }>(
        '/auth/student',
        {
          method: 'POST',
          body: JSON.stringify({ code, name }),
        },
      ),
    sync: (name?: string) =>
      request<{ user: import('../types').User }>('/auth/sync', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  dialogs: {
    list: () => request<{ dialogs: import('../types').Dialog[] }>('/dialogs'),
    get: (id: string) =>
      request<{ dialog: import('../types').Dialog }>(`/dialogs/${id}`),
    create: (data: {
      title: string
      sourceLanguage: string
      targetLanguage: string
      length: import('../types').DialogLength
      sections: import('../types').DialogSection[]
    }) =>
      request<{ dialog: import('../types').Dialog }>('/dialogs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<import('../types').Dialog>) =>
      request<{ dialog: import('../types').Dialog }>(`/dialogs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/dialogs/${id}`, { method: 'DELETE' }),
  },
  ai: {
    status: () => request<{ configured: boolean }>('/ai/status'),
    topic: (
      topic: string,
      targetLanguage: string,
      length: import('../types').DialogLength,
    ) =>
      request<{ title: string; sections: import('../types').DialogSection[] }>(
        '/ai/topic',
        { method: 'POST', body: JSON.stringify({ topic, targetLanguage, length }) },
      ),
    sentences: (
      sentences: string[],
      targetLanguage: string,
      length: import('../types').DialogLength,
    ) =>
      request<{ title: string; sections: import('../types').DialogSection[] }>(
        '/ai/sentences',
        { method: 'POST', body: JSON.stringify({ sentences, targetLanguage, length }) },
      ),
    chat: (
      messages: import('../types').ChatMessage[],
      targetLanguage: string,
      length: import('../types').DialogLength,
    ) =>
      request<{
        reply: string
        dialog?: { title: string; sections: import('../types').DialogSection[] }
      }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages, targetLanguage, length }),
      }),
    translate: (dialogId: string, targetLanguage: string) =>
      request<{ dialog: import('../types').Dialog }>('/ai/translate', {
        method: 'POST',
        body: JSON.stringify({ dialogId, targetLanguage }),
      }),
    birkenbihl: (dialogId: string, nativeLanguage: string) =>
      request<{ dialog: import('../types').Dialog }>('/ai/birkenbihl', {
        method: 'POST',
        body: JSON.stringify({ dialogId, nativeLanguage }),
      }),
    split: (dialogId: string) =>
      request<{ dialog: import('../types').Dialog }>('/ai/split', {
        method: 'POST',
        body: JSON.stringify({ dialogId }),
      }),
    image: (dialogId: string, sectionId: string) =>
      request<{ dialog: import('../types').Dialog; imageUrl: string }>('/ai/image', {
        method: 'POST',
        body: JSON.stringify({ dialogId, sectionId }),
      }),
    imageAll: (dialogId: string) =>
      request<{ dialog: import('../types').Dialog }>('/ai/image-all', {
        method: 'POST',
        body: JSON.stringify({ dialogId }),
      }),
  },
}
