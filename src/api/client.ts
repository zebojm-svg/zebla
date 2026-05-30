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

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Anfrage fehlgeschlagen')
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
        '/ai/generate/topic',
        { method: 'POST', body: JSON.stringify({ topic, targetLanguage, length }) },
      ),
    sentences: (
      sentences: string[],
      targetLanguage: string,
      length: import('../types').DialogLength,
    ) =>
      request<{ title: string; sections: import('../types').DialogSection[] }>(
        '/ai/generate/sentences',
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
      }>('/ai/generate/chat', {
        method: 'POST',
        body: JSON.stringify({ messages, targetLanguage, length }),
      }),
    translate: (dialogId: string, targetLanguage: string) =>
      request<{ dialog: import('../types').Dialog }>(`/ai/translate/${dialogId}`, {
        method: 'POST',
        body: JSON.stringify({ targetLanguage }),
      }),
    birkenbihl: (dialogId: string, nativeLanguage: string) =>
      request<{ dialog: import('../types').Dialog }>(`/ai/birkenbihl/${dialogId}`, {
        method: 'POST',
        body: JSON.stringify({ nativeLanguage }),
      }),
    split: (dialogId: string) =>
      request<{ dialog: import('../types').Dialog }>(`/ai/split/${dialogId}`, {
        method: 'POST',
      }),
    image: (dialogId: string, sectionId: string) =>
      request<{ dialog: import('../types').Dialog; imageUrl: string }>(
        `/ai/image/${dialogId}/${sectionId}`,
        { method: 'POST' },
      ),
    imageAll: (dialogId: string) =>
      request<{ dialog: import('../types').Dialog }>(`/ai/image-all/${dialogId}`, {
        method: 'POST',
      }),
  },
}
