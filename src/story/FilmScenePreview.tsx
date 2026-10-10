import { useEffect, useRef, useState } from 'react'
import { buildSpeakerIndexMap, useSpeechReader } from '../hooks/useSpeechReader'
import { isRtlLanguage } from '../types'
import type { Dialog } from '../types'
import type { FilmScene, FilmStoryboardPanel } from '../../shared/film-storyboard'
import { scenePlayBeats } from '../../shared/film-storyboard'
import { FilmStillPicture } from './FilmStillArrange'
import { createSceneBedMusic } from './sceneBedMusic'

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
  const { speakFrom, stop, speaking, cloudTtsReady, activeLineId } = useSpeechReader(
    dialog.targetLanguage,
    dialogId,
    onDialogUpdated,
  )
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
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
    currentPanel?.soundCue?.trim() || dialog.soundDirection?.trim() || ''
  const nativeName =
    !dialog.sourceLanguage || dialog.sourceLanguage === 'de'
      ? 'Deutsch'
      : dialog.sourceLanguage

  const pause = () => {
    cancelled.current = true
    runId.current += 1
    stop()
    musicRef.current?.pause()
    setPlaying(false)
  }

  const play = async (from: number) => {
    const id = ++runId.current
    cancelled.current = false
    setPlaying(true)
    if (musicOnRef.current) void getMusic().start()
    for (let i = from; i < beats.length; i++) {
      if (cancelled.current || id !== runId.current) break
      setIndex(i)
      const beat = beats[i]!
      if (beat.establishing || !beat.line) {
        await sleep(2200)
        continue
      }
      const speakLine = {
        id: beat.line.lineId || beat.panelId,
        speaker: beat.line.speaker || 'Sprecher',
        text: beat.line.text,
        audioUrl: beat.line.audioUrl,
      }
      await speakFrom([speakLine], buildSpeakerIndexMap([speakLine]), 0, 0.95, false)
    }
    if (id === runId.current) {
      musicRef.current?.pause()
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
      if (next) void getMusic().start()
      else musicRef.current?.pause()
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
