import { useEffect, useRef, useState } from 'react'
import { buildSpeakerIndexMap, useSpeechReader } from '../hooks/useSpeechReader'
import { isRtlLanguage } from '../types'
import type { Dialog } from '../types'
import type { FilmScene, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { scenePlayBeats } from '../../shared/film-storyboard'
import { foleyFlagsFromNote, SCENE_ESTABLISHING_MS } from '../../shared/film-scene-foley'
import { FilmStillPicture } from './FilmStillArrange'
import { createSceneBedMusic } from './sceneBedMusic'
import { api } from '../api/client'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

type Props = {
  dialogId: string
  dialog: Dialog
  scene: FilmScene
  panels: FilmStoryboardPanel[]
  onDialogUpdated: (dialog: Dialog) => void
}

export function FilmScenePreviewPlayer({
  dialogId,
  dialog,
  scene,
  panels,
  onDialogUpdated,
}: Props) {
  const beats = scenePlayBeats(panels, dialog)
  const hasPicture = beats.some((b) => Boolean(b.stillUrl))
  const { speakFrom, stop, unlockPlayback, speaking, cloudTtsReady, ttsError, activeLineId } =
    useSpeechReader(dialog.targetLanguage, dialogId, onDialogUpdated)
  const voiceBuffers = useRef<Map<string, AudioBuffer>>(new Map())
  const warming = useRef<Map<string, Promise<AudioBuffer | null>>>(new Map())
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [waitingVoice, setWaitingVoice] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const [musicOn, setMusicOn] = useState(true)
  const runId = useRef(0)
  const cancelled = useRef(false)
  const musicOnRef = useRef(true)
  const musicRef = useRef<ReturnType<typeof createSceneBedMusic> | null>(null)

  musicOnRef.current = musicOn

  const getMusic = () => {
    if (!musicRef.current) musicRef.current = createSceneBedMusic()
    return musicRef.current
  }

  useEffect(() => {
    return () => {
      cancelled.current = true
      stop()
      musicRef.current?.dispose()
      musicRef.current = null
    }
  }, [stop])

  useEffect(() => {
    if (beats.length === 0) return
    if (index >= beats.length) setIndex(0)
  }, [beats.length, index])

  if (!hasPicture) return null

  const current = beats[index] ?? beats[0]
  const currentPanel = current
    ? panels.find((p) => p.id === current.panelId)
    : undefined
  const spokenBeats = beats.filter((b) => !b.establishing)
  const nowLine = current?.establishing ? undefined : current?.line
  const soundNote =
    panels.map((p) => p.soundCue?.trim()).find(Boolean) ||
    dialog.soundDirection?.trim() ||
    ''
  const nativeName =
    !dialog.sourceLanguage || dialog.sourceLanguage === 'de'
      ? 'Deutsch'
      : dialog.sourceLanguage

  const pause = () => {
    cancelled.current = true
    runId.current += 1
    stop()
    musicRef.current?.pause()
    setWaitingVoice(false)
    setPlaying(false)
  }

  const warmLine = (lineId: string): Promise<AudioBuffer | null> => {
    const cached = voiceBuffers.current.get(lineId)
    if (cached) return Promise.resolve(cached)
    const inflight = warming.current.get(lineId)
    if (inflight) return inflight
    const job = (async () => {
      try {
        const res = await api.tts.getOrCreate({ dialogId, lineId, rate: 0.95 })
        onDialogUpdated(res.dialog)
        const blob = await api.tts.lineAudio(dialogId, lineId)
        const buf = await getMusic().decodeVoice(await blob.arrayBuffer())
        voiceBuffers.current.set(lineId, buf)
        return buf
      } catch {
        return null
      } finally {
        warming.current.delete(lineId)
      }
    })()
    warming.current.set(lineId, job)
    return job
  }

  const play = async (from: number) => {
    const id = ++runId.current
    cancelled.current = false
    setPlayError(null)
    unlockPlayback()
    setPlaying(true)
    const bed = getMusic()
    await bed.prepare()
    const foley = foleyFlagsFromNote(soundNote)
    if (musicOnRef.current) void bed.start(foley)
    for (let i = from; i < beats.length; i++) {
      if (cancelled.current || id !== runId.current) break
      setIndex(i)
      const beat = beats[i]!
      if (beat.establishing || !beat.line) {
        const next = beats.slice(i + 1).find((b) => b.line)
        if (next?.line?.lineId) void warmLine(next.line.lineId)
        await sleep(SCENE_ESTABLISHING_MS)
        continue
      }
      const lineId = beat.line.lineId || beat.panelId
      const nextSpoken = beats.slice(i + 1).find((b) => b.line)
      if (nextSpoken?.line?.lineId) void warmLine(nextSpoken.line.lineId)
      setWaitingVoice(true)
      const buf = await warmLine(lineId)
      setWaitingVoice(false)
      if (cancelled.current || id !== runId.current) break
      if (buf) {
        setPlayError(null)
        await bed.playVoice(buf, 0.95)
        continue
      }
      setPlayError(
        'KI-Stimme nicht geladen — Browser-Stimme wird versucht. Wenn es still bleibt, noch einmal auf «Szene abspielen» klicken.',
      )
      const speakLine = {
        id: lineId,
        speaker: beat.line.speaker || 'Sprecher',
        text: beat.line.text,
        audioUrl: beat.line.audioUrl,
      }
      await speakFrom([speakLine], buildSpeakerIndexMap([speakLine]), 0, 0.95, false)
    }
    if (id === runId.current) {
      musicRef.current?.pause()
      setWaitingVoice(false)
      setPlaying(false)
    }
  }

  const onToggle = () => {
    if (playing || speaking) {
      pause()
      return
    }
    const start = index >= beats.length - 1 && !playing ? 0 : index
    void play(start)
  }

  const onMusicToggle = () => {
    const next = !musicOn
    setMusicOn(next)
    if (playing || speaking) {
      if (next) void getMusic().start(foleyFlagsFromNote(soundNote))
      else musicRef.current?.pauseBed()
    }
  }

  const voiceLabel = cloudTtsReady ? 'KI-Stimme' : 'Browser-Stimme'

  return (
    <div className="film-scene-player">
      <p className="muted film-scene-player-note">
        <strong>Szene anhören:</strong> erst den Raum, dann eine Zeile nach der anderen —
        Bild wechselt zum Sprecher. Deutsch steht unter der Zeile.
      </p>
      <p className="muted film-scene-player-voice">
        {voiceLabel}
        {musicOn ? ' · Hintergrund an' : ' · Hintergrund aus'}
        {soundNote ? ` · ${soundNote}` : ''}
      </p>
      {ttsError ? <div className="alert alert-error">{ttsError}</div> : null}
      {playError ? <div className="alert alert-warn">{playError}</div> : null}
      {waitingVoice ? (
        <p className="muted film-scene-player-wait">Stimme wird vorbereitet…</p>
      ) : null}
      {spokenBeats.length === 0 ? (
        <p className="alert alert-warn">Kein Dialog in dieser Szene — deshalb spricht niemand.</p>
      ) : null}
      <div className="film-scene-player-frame">
        {currentPanel?.stillUrl ? (
          <FilmStillPicture dialogId={dialogId} panel={currentPanel} interactive={false} />
        ) : (
          <div className="film-still-placeholder">Noch kein gemaltes Bild</div>
        )}
      </div>
      <p className="film-scene-player-count">
        {current?.establishing
          ? `Raum anschauen${scene.title ? ` · ${scene.title}` : ''}`
          : `Zeile ${(current?.lineIndex ?? 0) + 1} von ${current?.lineTotal || spokenBeats.length}${
              scene.title ? ` · ${scene.title}` : ''
            }`}
      </p>
      {nowLine ? (
        <div className="film-play-now">
          <p className="film-play-now-speaker">Jetzt: {nowLine.speaker}</p>
          <p
            className="film-play-now-target"
            dir={isRtlLanguage(dialog.targetLanguage) ? 'rtl' : undefined}
            lang={dialog.targetLanguage}
          >
            {nowLine.text}
          </p>
          {nowLine.nativeDe ? (
            <p className="film-play-now-de" lang={dialog.sourceLanguage || 'de'}>
              <span className="film-beat-de-label">{nativeName}</span>
              {nowLine.nativeDe}
            </p>
          ) : (
            <p className="muted film-play-now-de">
              Deutsch fehlt — oben «Deutsch anzeigen» drücken.
            </p>
          )}
        </div>
      ) : (
        <p className="muted film-play-now">Erst den ganzen Raum, dann spricht jemand.</p>
      )}
      {spokenBeats.length > 0 ? (
        <ol className="film-play-list">
          {spokenBeats.map((beat) => {
            const line = beat.line
            if (!line) return null
            const isNow =
              (playing || speaking) &&
              (activeLineId === line.lineId || current?.line?.lineId === line.lineId)
            return (
              <li key={line.lineId || beat.panelId + beat.lineIndex} className={isNow ? 'is-now' : undefined}>
                <strong>{line.speaker}</strong>
                {line.nativeDe ? ` — ${line.nativeDe}` : ` — ${line.text}`}
              </li>
            )
          })}
        </ol>
      ) : null}
      <div className="film-scene-player-controls">
        <button type="button" className="btn btn-story-studio" onClick={onToggle}>
          {playing || speaking ? 'Pause' : 'Szene abspielen'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={musicOn}
          title="Leise Hintergrundmusik"
          onClick={onMusicToggle}
        >
          {musicOn ? 'Hintergrund aus' : 'Hintergrund an'}
        </button>
      </div>
    </div>
  )
}
