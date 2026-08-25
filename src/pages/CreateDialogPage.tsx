import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { LanguageFlag } from '../components/LanguageFlag'
import type { ChatMessage, CreateMode, DialogLength } from '../types'
import { LENGTH_LABELS, LANGUAGES } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { FilmProjectNav } from '../story/FilmProjectNav'

export function CreateDialogPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const folderId = searchParams.get('folder')
  const [mode, setMode] = useState<CreateMode>('topic')
  const [targetLanguage, setTargetLanguage] = useState('en')
  const [length, setLength] = useState<DialogLength>('medium')
  const [topic, setTopic] = useState('')
  const [sentences, setSentences] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [imageDirection, setImageDirection] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isListening, setIsListening] = useState(false)

  const saveDialog = async (
    title: string,
    sections: import('../types').DialogSection[],
    creation: {
      creationMode: CreateMode
      creationPrompt?: string
      creationChat?: ChatMessage[]
    },
  ) => {
    const { dialog } = await api.dialogs.create({
      title,
      sourceLanguage: 'de',
      targetLanguage,
      length,
      sections,
      folderId: folderId ?? null,
      creationMode: creation.creationMode,
      creationPrompt: creation.creationPrompt,
      creationChat: creation.creationChat,
      imageDirection: imageDirection.trim() || undefined,
    })
    navigate(`/dialog/${dialog.id}`)
  }

  const handleTopic = async () => {
    if (!topic.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await api.ai.topic(topic.trim(), targetLanguage, length)
      await saveDialog(result.title, result.sections, {
        creationMode: 'topic',
        creationPrompt: topic.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
      setLoading(false)
    }
  }

  const handleSentences = async () => {
    const list = sentences
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!list.length) return
    setLoading(true)
    setError('')
    try {
      const result = await api.ai.sentences(list, targetLanguage, length)
      await saveDialog(result.title, result.sections, {
        creationMode: 'dictate',
        creationPrompt: list.join('\n'),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
      setLoading(false)
    }
  }

  const handleChatSend = async () => {
    if (!chatInput.trim()) return
    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user', content: chatInput.trim() },
    ]
    setChatMessages(newMessages)
    setChatInput('')
    setLoading(true)
    setError('')
    try {
      const result = await api.ai.chat(newMessages, targetLanguage, length)
      setChatMessages([...newMessages, { role: 'assistant', content: result.reply }])
      if (result.dialog) {
        await saveDialog(result.dialog.title, result.dialog.sections, {
          creationMode: 'chat',
          creationChat: newMessages,
          creationPrompt: newMessages.map((m) => m.content).join('\n'),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  const startDictation = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('Spracherkennung wird in diesem Browser nicht unterstützt.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'de-DE'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => {
      setIsListening(false)
      setError('Diktat fehlgeschlagen.')
    }
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript
      if (text) {
        setSentences((prev) => (prev ? `${prev}\n${text}` : text))
      }
    }

    recognition.start()
  }

  return (
    <div className="create-page">
      <FilmProjectNav />
      <div className="page-header">
        <h1>{t('create.title')}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="settings-row">
        <label>
          {t('create.targetLang')}
          <span className="lang-select-row">
            <LanguageFlag code={targetLanguage} size="md" />
            <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label>
          Dialoglänge
          <select value={length} onChange={(e) => setLength(e.target.value as DialogLength)}>
            {(Object.keys(LENGTH_LABELS) as DialogLength[]).map((k) => (
              <option key={k} value={k}>
                {LENGTH_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="create-image-direction">
        Bild-Regie (optional)
        <textarea
          rows={3}
          value={imageDirection}
          onChange={(e) => setImageDirection(e.target.value)}
          placeholder="z.B. Julien sitzt im Park, Herbst, Vögel. Bei Zeile 4 winkt er."
        />
        <span className="muted create-image-direction-hint">
          Ort, Pose, Ton. Danach «Ins Storyboard» — vorhandene Julien-Bilder werden zuerst genommen.
        </span>
      </label>

      <div className="mode-tabs">
        {(
          [
            ['chat', 'KI-Gespräch'],
            ['topic', 'Thema'],
            ['dictate', 'Diktat'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={`mode-tab ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'topic' && (
        <section className="panel">
          <h2>Dialog zu einem Thema</h2>
          <p className="muted">Die KI erstellt einen Dialog zum gewünschten Thema.</p>
          <label>
            Thema
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="z.B. Im Café bestellen"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleTopic}
            disabled={loading || !topic.trim()}
          >
            {loading ? 'Erstelle …' : 'Dialog generieren'}
          </button>
        </section>
      )}

      {mode === 'dictate' && (
        <section className="panel">
          <h2>Sätze diktieren</h2>
          <p className="muted">
            Gib Sätze ein oder diktiere sie – die KI formt daraus einen Dialog.
          </p>
          <label>
            Sätze (eine Zeile pro Satz)
            <textarea
              rows={8}
              value={sentences}
              onChange={(e) => setSentences(e.target.value)}
              placeholder={'Guten Tag.\nIch hätte gern einen Kaffee.\nMit Milch, bitte.'}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className={`btn btn-secondary ${isListening ? 'listening' : ''}`}
              onClick={startDictation}
              disabled={isListening}
            >
              {isListening ? 'Höre zu …' : 'Diktieren'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSentences}
              disabled={loading || !sentences.trim()}
            >
              {loading ? 'Erstelle …' : 'Zu Dialog formen'}
            </button>
          </div>
        </section>
      )}

      {mode === 'chat' && (
        <section className="panel">
          <h2>KI-Gespräch</h2>
          <p className="muted">
            Besprich mit der KI, welchen Dialog du brauchst – sie erstellt ihn am Ende.
          </p>
          <div className="chat-window">
            {chatMessages.length === 0 && (
              <p className="muted chat-empty">
                Starte z.B.: „Ich brauche einen Dialog für die 7. Klasse über Einkaufen."
              </p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-${m.role}`}>
                {m.content}
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleChatSend()}
              placeholder="Nachricht an die KI …"
              disabled={loading}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleChatSend}
              disabled={loading || !chatInput.trim()}
            >
              {loading ? '…' : 'Senden'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
