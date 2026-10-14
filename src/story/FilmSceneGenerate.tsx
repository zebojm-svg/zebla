import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  STORY_ART_STYLES,
  type StoryArtStyleId,
} from '../../shared/story-art-styles'
import type { Dialog } from '../types'
import { LineLanguageLayers } from '../components/LineLanguageLayers'
import type { FilmScene, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  isFilmStoryboard,
  normalizeFilmStoryboard,
  panelAddressee,
  panelDialogueLines,
  type FilmPanelDialogueLine,
} from '../../shared/film-storyboard'
import { sceneHarvestNotesDe } from '../../shared/film-library-harvest'
import {
  gazeNoteDe,
  sceneGrundbildPanel,
  sceneStillProgress,
  seatingNoteDe,
  stillLibraryHintDe,
} from '../../shared/film-stills'
import { FilmStillPicture } from './FilmStillArrange'

type Props = {
  dialogId: string
  scene: FilmScene
  panels: FilmStoryboardPanel[]
  styleId: string
  onStyleChange: (styleId: string) => void
  busy: boolean
  extraDisabled?: boolean
  progress?: { current: number; total: number } | null
  error?: string
  onGenerate: (force: boolean) => void
  onRematch?: () => void
  shotPlanDe?: string
  expectedShots?: number
}

export function FilmSceneGenerateBar({
  dialogId,
  scene,
  panels,
  styleId,
  onStyleChange,
  busy,
  extraDisabled,
  progress,
  error,
  onGenerate,
  onRematch,
  shotPlanDe,
  expectedShots,
}: Props) {
  const stats = sceneStillProgress(panels, styleId)
  const hint = stillLibraryHintDe(panels)
  const harvestNotes = sceneHarvestNotesDe(panels)
  const allDone = stats.total > 0 && stats.pending === 0
  const paintingOne = Boolean(busy && progress && progress.total === 1)
  const label = busy
    ? paintingOne
      ? 'Bild wird neu gemalt …'
      : progress
        ? `Erzeuge Szene … Bild ${progress.current} von ${progress.total}`
        : 'Erzeuge Szene …'
    : allDone
      ? 'Szene nochmals erzeugen'
      : stats.done > 0
        ? 'Fehlende Bilder erzeugen'
        : 'Diese Szene erzeugen'

  return (
    <div className="film-scene-generate">
      <label className="film-scene-style">
        <span>Stil dieser Szene</span>
        <select
          value={styleId}
          disabled={busy || extraDisabled}
          onChange={(e) => onStyleChange(e.target.value as StoryArtStyleId)}
        >
          {STORY_ART_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-story-studio film-scene-make"
        disabled={busy || extraDisabled || stats.total === 0}
        onClick={() => onGenerate(allDone)}
      >
        {label}
      </button>
      {onRematch ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || extraDisabled}
          onClick={onRematch}
        >
          Welt holen
        </button>
      ) : null}
      <p className="muted film-scene-still-note">
        {shotPlanDe ||
          'Ein Bild je Dialogzeile. Die erste Zeile ist das Grundbild (ganzer Raum, wer wo sitzt). Die nächsten nehmen dasselbe Bild, bis du unter «Bild ändern» etwas neu malst. Kurzer Hinweis reicht — Sitzplan und Raum gehen von allein mit.'}
        {stats.done > 0 ? ` ${stats.done} von ${stats.total} Bildern fertig.` : ''}
      </p>
      {expectedShots != null && stats.total < expectedShots ? (
        <p className="alert alert-warn">
          Hier sind nur {stats.total} Bild{stats.total === 1 ? '' : 'er'}, erwartet sind{' '}
          {expectedShots} (eines je Dialogzeile). Oben «Bilder planen» drücken.
        </p>
      ) : null}
      {busy ? (
        <p className="film-scene-progress" aria-live="polite">
          {paintingOne
            ? `Bild in «${scene.title}» wird neu gemalt …`
            : `Erzeuge Szene «${scene.title}»${
                progress ? ` — Bild ${progress.current} von ${progress.total}` : ' …'
              }`}
        </p>
      ) : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {hint ? (
        <p className="alert alert-warn">
          {hint}{' '}
          <Link to={`/library?dialog=${dialogId}`}>Zur Bibliothek</Link>
        </p>
      ) : null}
      {harvestNotes.map((note) => (
        <p key={note} className="alert alert-info film-harvest-note">
          {note}{' '}
          <Link to={`/library?dialog=${dialogId}`}>Zur Bibliothek</Link>
        </p>
      ))}
    </div>
  )
}

export function FilmBeatText({
  lines,
  targetLanguage,
  sourceLanguage,
  nativeSlotFor,
}: {
  lines: FilmPanelDialogueLine[]
  targetLanguage?: string
  sourceLanguage?: string
  nativeSlotFor?: (line: FilmPanelDialogueLine) => ReactNode
}) {
  if (lines.length === 0) {
    return <p className="muted">Kein Dialog zu diesem Bild</p>
  }
  return (
    <div className="film-beat-lines">
      {lines.map((line, i) => (
        <div key={line.lineId ?? i} className="film-beat-line">
          <LineLanguageLayers
            nativeText={line.nativeDe}
            targetText={line.text}
            birkenbihl={line.birkenbihl}
            targetLanguage={targetLanguage}
            sourceLanguage={sourceLanguage}
            kind={line.kind}
            speaker={line.speaker}
            nativeSlot={nativeSlotFor?.(line)}
            missingNativeHint="Noch kein Deutsch — oben «Deutsch unter die Zeilen»."
            missingTargetHint="Zielsprache machst du unter Text"
          />
        </div>
      ))}
    </div>
  )
}

export function FilmNativeEditor({
  lines,
  sourceLanguage,
  busy,
  onConfirm,
}: {
  lines: FilmPanelDialogueLine[]
  sourceLanguage?: string
  busy?: boolean
  onConfirm?: (lineId: string, nativeText: string) => void
}) {
  const line = lines[0]
  const [text, setText] = useState(line?.nativeDe ?? '')
  useEffect(() => {
    setText(line?.nativeDe ?? '')
  }, [line?.lineId, line?.nativeDe])
  if (!line) return <p className="muted">Kein Dialog zu diesem Bild</p>
  if (!onConfirm || !line.lineId) {
    return line.nativeDe ? (
      <p className="film-beat-de" lang={sourceLanguage || 'de'}>
        {line.nativeDe}
      </p>
    ) : (
      <p className="muted">Keine Übersetzung</p>
    )
  }
  const dirty = text.trim() !== (line.nativeDe ?? '').trim()
  return (
    <div className="film-native-edit">
      <textarea
        className="input"
        rows={3}
        value={text}
        disabled={busy}
        lang={sourceLanguage || 'de'}
        placeholder="Deutscher Dialog (nicht Wort für Wort). Namen wie Ramo, Ubai, Schöme."
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy || !text.trim() || !dirty}
        onClick={() => onConfirm(line.lineId!, text.trim())}
      >
        {busy ? 'Passt an …' : 'Übernehmen'}
      </button>
    </div>
  )
}

export function FilmCueFields({
  panel,
  busy,
  onSave,
}: {
  panel: FilmStoryboardPanel
  busy?: boolean
  onSave?: (cues: { soundCue?: string; imageCue?: string; speechCue?: string }) => void
}) {
  const [soundCue, setSoundCue] = useState(panel.soundCue ?? '')
  const [imageCue, setImageCue] = useState(panel.imageCue ?? '')
  useEffect(() => {
    setSoundCue(panel.soundCue ?? '')
    setImageCue(panel.imageCue ?? '')
  }, [panel.id, panel.soundCue, panel.imageCue])
  if (!onSave) return null
  return (
    <div className="film-cue-fields">
      <label>
        <span>Ton</span>
        <textarea
          className="input"
          rows={2}
          value={soundCue}
          disabled={busy}
          placeholder="z.B. leise persische Musik, ab und zu eine Nuss knacken"
          onChange={(e) => setSoundCue(e.target.value)}
          onBlur={() => {
            if (soundCue.trim() !== (panel.soundCue ?? '').trim()) onSave({ soundCue })
          }}
        />
      </label>
      <label>
        <span>Bild</span>
        <textarea
          className="input"
          rows={2}
          value={imageCue}
          disabled={busy}
          placeholder="z.B. Ubai schaut müde, aber erleichtert"
          onChange={(e) => setImageCue(e.target.value)}
          onBlur={() => {
            if (imageCue.trim() !== (panel.imageCue ?? '').trim()) onSave({ imageCue })
          }}
        />
      </label>
    </div>
  )
}

export function FilmBeatNotes({
  panel,
  dialog,
  hideCues,
}: {
  panel: FilmStoryboardPanel
  dialog?: Dialog | null
  hideCues?: boolean
}) {
  const look = dialog?.storyMeta?.lookNote?.trim()
  const board =
    dialog?.filmStoryboard && isFilmStoryboard(dialog.filmStoryboard)
      ? normalizeFilmStoryboard(dialog.filmStoryboard)
      : null
  const wide = board ? sceneGrundbildPanel(board, panel.sceneId) : undefined
  const seats = seatingNoteDe((wide ?? panel).placements)
  const speaker = panel.closeupSpeaker || panelDialogueLines(panel, dialog)[0]?.speaker || ''
  const gaze = gazeNoteDe(speaker, panelAddressee(panel, dialog), look)
  return (
    <div className="film-beat-notes-list">
      {panel.shot === 'closeup' ? (
        <p>
          <strong>Kamera</strong> Nahaufnahme {panel.closeupSpeaker || ''} — Kamera wechselt den Platz, man schaut der Person ins Gesicht (nicht nur Kopf drehen)
        </p>
      ) : panel.shot === 'insert' ? (
        <p>
          <strong>Kamera</strong> Zwischenbild — {panel.imageCue || 'Detail, nicht der ganze Raum'}
        </p>
      ) : (
        <p>
          <strong>Kamera</strong> Weit — ganzer Raum (Grundbild)
        </p>
      )}
      {!hideCues && panel.imageCue ? <p>{panel.imageCue}</p> : null}
      {seats ? (
        <p>
          <strong>Sitzplan</strong> {seats}
        </p>
      ) : null}
      {!hideCues && panel.speechCue ? (
        <p>
          <strong>Sprache</strong> {panel.speechCue}
        </p>
      ) : null}
      {!hideCues && panel.soundCue ? (
        <p>
          <strong>Ton</strong> {panel.soundCue}
        </p>
      ) : null}
      {gaze ? (
        <p>
          <strong>Blick</strong> {gaze}
        </p>
      ) : null}
      {panel.expressionHint ? (
        <p>
          <strong>Gesicht</strong> {panel.expressionHint}
        </p>
      ) : null}
    </div>
  )
}

export function FilmBeatColumns({
  picture,
  underPicture,
  lines,
  notes,
  targetLanguage,
  sourceLanguage,
  nativeBusy,
  onConfirmNative,
}: {
  picture: ReactNode
  underPicture?: ReactNode
  lines: FilmPanelDialogueLine[]
  notes?: ReactNode
  targetLanguage?: string
  sourceLanguage?: string
  nativeBusy?: boolean
  onConfirmNative?: (lineId: string, nativeText: string) => void
}) {
  return (
    <div className="film-beat">
      <div className="film-beat-pic">
        <p className="film-beat-col-label">Bild</p>
        {picture}
        {underPicture}
      </div>
      <div className="film-beat-text">
        <FilmBeatText
          lines={lines}
          targetLanguage={targetLanguage}
          sourceLanguage={sourceLanguage}
          nativeSlotFor={
            onConfirmNative
              ? (line) => (
                  <FilmNativeEditor
                    lines={[line]}
                    sourceLanguage={sourceLanguage}
                    busy={nativeBusy}
                    onConfirm={onConfirmNative}
                  />
                )
              : undefined
          }
        />
      </div>
      {notes ? (
        <details className="film-beat-regie">
          <summary>Regie</summary>
          {notes}
        </details>
      ) : null}
    </div>
  )
}

export function FilmPanelDialogue({
  panel,
  dialog,
}: {
  panel: FilmStoryboardPanel
  dialog?: Dialog | null
}) {
  const lines = panelDialogueLines(panel, dialog)
  return (
    <FilmBeatText
      lines={lines}
      targetLanguage={dialog?.targetLanguage}
      sourceLanguage={dialog?.sourceLanguage}
    />
  )
}

export function FilmStillFixBar({
  panel,
  busy,
  error,
  status,
  onCorrect,
  onInsert,
}: {
  panel: FilmStoryboardPanel
  busy: boolean
  error?: string
  status?: string
  onCorrect?: (note: string) => void
  onInsert?: (text: string) => void
}) {
  const [note, setNote] = useState(panel.stillCorrection ?? '')
  const [insertText, setInsertText] = useState('')
  const [localError, setLocalError] = useState('')
  if (!onCorrect && !onInsert) return null
  const shownError = error || localError
  return (
    <div className="film-still-fix">
      {onCorrect ? (
        <>
          <div className="film-tweak">
            <input
              className="input"
              value={note}
              disabled={busy}
              placeholder="z.B. Schöme ist ein Mann, Ramo steht auf"
              onChange={(e) => {
                setNote(e.target.value)
                if (localError) setLocalError('')
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => {
                const hint = note.trim()
                if (!hint) {
                  setLocalError('Schreib zuerst einen kurzen Hinweis, dann «Bild ändern».')
                  return
                }
                setLocalError('')
                onCorrect(hint)
              }}
            >
              {busy && status ? 'Läuft …' : 'Bild ändern'}
            </button>
          </div>
          {busy && status ? (
            <p className="film-panel-painting" aria-live="polite">
              {status}
            </p>
          ) : null}
          {!busy && shownError ? <div className="alert alert-error">{shownError}</div> : null}
        </>
      ) : null}
      {onInsert ? (
        <div className="film-tweak">
          <input
            className="input"
            value={insertText}
            disabled={busy}
            placeholder="z.B. Es klingelt, Ramo geht zur Tür"
            onChange={(e) => setInsertText(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || !insertText.trim()}
            onClick={() => {
              onInsert(insertText.trim())
              setInsertText('')
            }}
          >
            Bild danach einfügen
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function FilmStillStrip({
  dialogId,
  panels,
  dialog,
  sceneTitle,
  busy,
  busyPanelId,
  errors,
  status,
  onCorrect,
  onInsert,
  onLayout,
}: {
  dialogId: string
  panels: FilmStoryboardPanel[]
  dialog?: Dialog | null
  sceneTitle?: string
  busy?: boolean
  busyPanelId?: string | null
  errors?: Record<string, string>
  status?: string
  onCorrect?: (panel: FilmStoryboardPanel, note: string) => void
  onInsert?: (panel: FilmStoryboardPanel, text: string) => void
  onLayout?: (dialog: Dialog, board: import('../../shared/film-storyboard').FilmStoryboard) => void
}) {
  if (panels.length === 0) return null
  return (
    <div className="film-still-strip">
      {panels.map((panel) => {
        const panelBusy = Boolean(busy && busyPanelId === panel.id)
        const lines = panelDialogueLines(panel, dialog, panels, sceneTitle)
        return (
          <article key={panel.id} className="film-panel">
            <FilmBeatColumns
              picture={
                panel.stillUrl || panel.background.imageUrl ? (
                  <FilmStillPicture dialogId={dialogId} panel={panel} onUpdated={onLayout} />
                ) : (
                  <div className="film-still-placeholder">
                    {panelBusy ? 'Erzeuge Bild …' : 'Noch kein Bild'}
                  </div>
                )
              }
              underPicture={
                <FilmStillFixBar
                  panel={panel}
                  busy={Boolean(busy)}
                  error={errors?.[panel.id]}
                  status={busyPanelId === panel.id ? status : undefined}
                  onCorrect={onCorrect ? (note) => onCorrect(panel, note) : undefined}
                />
              }
              lines={lines}
              targetLanguage={dialog?.targetLanguage}
              sourceLanguage={dialog?.sourceLanguage}
              notes={
                <>
                  <p className="film-beat-count">
                    Bild {panel.panelIndex}
                    {panel.stillError ? <span className="film-still-err"> · Fehler</span> : null}
                    {panelBusy ? <span> · wird korrigiert …</span> : null}
                  </p>
                  <FilmBeatNotes panel={panel} dialog={dialog} />
                  <FilmStillFixBar
                    panel={panel}
                    busy={Boolean(busy)}
                    onInsert={onInsert ? (text) => onInsert(panel, text) : undefined}
                  />
                  {panel.harvestNoteDe ? (
                    <p className="muted film-harvest-note">{panel.harvestNoteDe}</p>
                  ) : null}
                </>
              }
            />
          </article>
        )
      })}
    </div>
  )
}
