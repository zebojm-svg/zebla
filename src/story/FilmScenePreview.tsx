import { useEffect, useRef, useState } from 'react'
import { buildSpeakerIndexMap, useSpeechReader } from '../hooks/useSpeechReader'
import type { Dialog } from '../types'
import type { FilmScene, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  panelDialogueLines,
  scenePreviewBeats,
} from '../../shared/film-storyboard'

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
  const beats = scenePreviewBeats(panels, dialog)
  const hasPicture = beats.some((b) => b.stillUrl)
  const { speakFrom, stop, speaking } = useSpeechReader(
    dialog.targetLanguage,
    dialogId,
    onDialogUpdated,
  )
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const runId = useRef(0)
  const cancelled = useRef(false)

  useEffect(() => {
    return () => {
      cancelled.current = true
      stop()
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
  const dialogue = currentPanel ? panelDialogueLines(currentPanel, dialog) : []

  const pause = () => {
    cancelled.current = true
    runId.current += 1
    stop()
    setPlaying(false)
  }

  const play = async (from: number) => {
    const id = ++runId.current
    cancelled.current = false
    setPlaying(true)
    for (let i = from; i < beats.length; i++) {
      if (cancelled.current || id !== runId.current) break
      setIndex(i)
      const beat = beats[i]!
      if (beat.lines.length === 0) {
        await sleep(1800)
        continue
      }
      await speakFrom(beat.lines, buildSpeakerIndexMap(beat.lines), 0, 0.95, false)
    }
    if (id === runId.current) setPlaying(false)
  }

  const onToggle = () => {
    if (playing || speaking) {
      pause()
      return
    }
    const start = index >= beats.length - 1 && !playing ? 0 : index
    void play(start)
  }

  return (
    <div className="film-scene-player">
      <p className="muted film-scene-player-note">
        <strong>Szene anhören:</strong> Standbilder + Stimme, noch kein Bewegungsfilm.
      </p>
      <div className="film-scene-player-frame">
        {current?.stillUrl ? (
          <img
            src={current.stillUrl}
            alt={current.caption || `Bild ${current.panelIndex}`}
          />
        ) : (
          <div className="film-still-placeholder">Noch kein Bild</div>
        )}
      </div>
      <p className="film-scene-player-count">
        Bild {current?.panelIndex ?? index + 1} von {beats.length}
        {scene.title ? ` · ${scene.title}` : ''}
      </p>
      {dialogue.length > 0 ? (
        <div className="film-still-dialog">
          {dialogue.map((line, i) => (
            <p key={`${line.lineId ?? i}`}>
              {line.speaker ? <strong>{line.speaker}: </strong> : null}
              {line.text}
            </p>
          ))}
        </div>
      ) : current?.caption ? (
        <p className="film-still-dialog">{current.caption}</p>
      ) : null}
      <div className="film-scene-player-controls">
        <button
          type="button"
          className="btn btn-story-studio"
          onClick={onToggle}
        >
          {playing || speaking ? 'Pause' : 'Szene abspielen'}
        </button>
      </div>
    </div>
  )
}
