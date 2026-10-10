import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  STORY_ART_STYLES,
  type StoryArtStyleId,
} from '../../shared/story-art-styles'
import type { Dialog } from '../types'
import { isRtlLanguage, languageName } from '../types'
import type { FilmScene, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  panelDialogueLines,
  type FilmPanelDialogueLine,
} from '../../shared/film-storyboard'
import { sceneHarvestNotesDe } from '../../shared/film-library-harvest'
import { sceneStillProgress, stillLibraryHintDe } from '../../shared/film-stills'
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
  const label = busy
    ? progress
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
          'Zuerst der ganze Raum, dann Nahaufnahme derselben Person am selben Platz — Tisch bleibt sichtbar, scharfe Augen, kein neues Porträt.'}
        {stats.done > 0 ? ` ${stats.done} von ${stats.total} Bildern fertig.` : ''}
      </p>
      {expectedShots != null && stats.total < expectedShots ? (
        <p className="alert alert-warn">
          Hier sind nur {stats.total} Bild{stats.total === 1 ? '' : 'er'}, erwartet sind{' '}
          {expectedShots} (1 Übersicht + Nahaufnahme je Sprecher). Oben auf Vom Text neu
          drücken.
        </p>
      ) : null}
      {busy ? (
        <p className="film-scene-progress" aria-live="polite">
          Erzeuge Szene «{scene.title}»
          {progress ? ` — Bild ${progress.current} von ${progress.total}` : ' …'}
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
  fallback,
  targetLanguage,
  sourceLanguage,
  which = 'both',
}: {
  lines: FilmPanelDialogueLine[]
  fallback?: string
  targetLanguage?: string
  sourceLanguage?: string
  which?: 'target' | 'native' | 'both'
}) {
  const nativeName =
    !sourceLanguage || sourceLanguage === 'de' ? 'Deutsch' : languageName(sourceLanguage)
  if (lines.length === 0) {
    if (which === 'native') return <p className="muted">Keine Übersetzung</p>
    return fallback ? <p className="film-beat-target">{fallback}</p> : <p className="muted">Kein Text</p>
  }
  return (
    <div className="film-beat-lines">
      {lines.map((line, i) => (
        <div key={line.lineId ?? i} className="film-beat-line">
          {which !== 'native' ? (
            <p
              className="film-beat-target"
              dir={isRtlLanguage(targetLanguage ?? '') ? 'rtl' : undefined}
              lang={targetLanguage}
            >
              {line.speaker ? <strong>{line.speaker}: </strong> : null}
              {line.text}
            </p>
          ) : null}
          {which !== 'target' ? (
            line.nativeDe ? (
              <p className="film-beat-de" lang={sourceLanguage || 'de'}>
                {which === 'native' && line.speaker ? <strong>{line.speaker}: </strong> : null}
                {which !== 'native' ? (
                  <span className="film-beat-de-label">{nativeName}</span>
                ) : null}
                {line.nativeDe}
              </p>
            ) : which === 'native' ? (
              <p className="muted film-beat-de">
                {line.speaker ? <strong>{line.speaker}: </strong> : null}
                {'— '}
                <span className="film-beat-de-hint">
                  oben Deutsch anzeigen oder unter Text, KI-Werkzeuge
                </span>
              </p>
            ) : null
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function FilmBeatNotes({
  panel,
  dialog,
}: {
  panel: FilmStoryboardPanel
  dialog?: Dialog | null
}) {
  const voices = dialog?.storyMeta?.voicesNote?.trim()
  const look = dialog?.storyMeta?.lookNote?.trim()
  return (
    <div className="film-beat-notes-list">
      {panel.shot === 'closeup' ? (
        <p>
          <strong>Kamera</strong> Nahaufnahme {panel.closeupSpeaker || ''}
        </p>
      ) : (
        <p>
          <strong>Kamera</strong> Weit — ganzer Raum
        </p>
      )}
      {panel.imageCue ? <p>{panel.imageCue}</p> : null}
      {voices ? (
        <p>
          <strong>Stimmen</strong> {voices}
        </p>
      ) : null}
      {panel.speechCue ? (
        <p>
          <strong>Sprache</strong> {panel.speechCue}
        </p>
      ) : null}
      {panel.soundCue ? (
        <p>
          <strong>Ton</strong> {panel.soundCue}
        </p>
      ) : null}
      {look ? (
        <p>
          <strong>Blick</strong> {look}
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
  lines,
  fallback,
  notes,
  targetLanguage,
  sourceLanguage,
}: {
  picture: ReactNode
  lines: FilmPanelDialogueLine[]
  fallback?: string
  notes: ReactNode
  targetLanguage?: string
  sourceLanguage?: string
}) {
  const targetName = languageName(targetLanguage || '')
  const nativeName =
    !sourceLanguage || sourceLanguage === 'de' ? 'Deutsch' : languageName(sourceLanguage)
  return (
    <div className="film-beat">
      <div className="film-beat-pic">
        <p className="film-beat-col-label">Bild</p>
        {picture}
      </div>
      <div className="film-beat-text">
        <p className="film-beat-col-label">{targetLanguage ? targetName : 'Text'}</p>
        <FilmBeatText
          lines={lines}
          fallback={fallback}
          targetLanguage={targetLanguage}
          sourceLanguage={sourceLanguage}
          which="target"
        />
      </div>
      <div className="film-beat-native">
        <p className="film-beat-col-label">{nativeName}</p>
        <FilmBeatText
          lines={lines}
          fallback={fallback}
          targetLanguage={targetLanguage}
          sourceLanguage={sourceLanguage}
          which="native"
        />
      </div>
      <aside className="film-beat-notes">
        <p className="film-beat-col-label">Ablauf</p>
        {notes}
      </aside>
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
      fallback={panel.caption}
      targetLanguage={dialog?.targetLanguage}
      sourceLanguage={dialog?.sourceLanguage}
    />
  )
}

export function FilmStillFixBar({
  panel,
  busy,
  onCorrect,
  onInsert,
}: {
  panel: FilmStoryboardPanel
  busy: boolean
  onCorrect?: (note: string) => void
  onInsert?: (text: string) => void
}) {
  const [note, setNote] = useState(panel.stillCorrection ?? '')
  const [insertText, setInsertText] = useState('')
  if (!onCorrect && !onInsert) return null
  return (
    <div className="film-still-fix">
      {onCorrect ? (
        <div className="film-tweak">
          <input
            className="input"
            value={note}
            disabled={busy}
            placeholder="Was stimmt nicht? z.B. Prospekt fehlt, beide schauen in die Luft"
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || !note.trim()}
            onClick={() => onCorrect(note.trim())}
          >
            Bild korrigieren
          </button>
        </div>
      ) : null}
      {onInsert ? (
        <div className="film-tweak">
          <input
            className="input"
            value={insertText}
            disabled={busy}
            placeholder="z.B. Nahaufnahme Prospekt, man sieht direkt hinein"
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
  busy,
  busyPanelId,
  onCorrect,
  onInsert,
  onLayout,
}: {
  dialogId: string
  panels: FilmStoryboardPanel[]
  dialog?: Dialog | null
  busy?: boolean
  busyPanelId?: string | null
  onCorrect?: (panel: FilmStoryboardPanel, note: string) => void
  onInsert?: (panel: FilmStoryboardPanel, text: string) => void
  onLayout?: (dialog: Dialog, board: import('../../shared/film-storyboard').FilmStoryboard) => void
}) {
  if (panels.length === 0) return null
  return (
    <div className="film-still-strip">
      {panels.map((panel) => {
        const panelBusy = Boolean(busy && busyPanelId === panel.id)
        const lines = panelDialogueLines(panel, dialog)
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
              lines={lines}
              fallback={panel.caption}
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
                  {panel.harvestNoteDe ? (
                    <p className="muted film-harvest-note">{panel.harvestNoteDe}</p>
                  ) : null}
                </>
              }
            />
            <FilmStillFixBar
              panel={panel}
              busy={Boolean(busy)}
              onCorrect={onCorrect ? (note) => onCorrect(panel, note) : undefined}
              onInsert={onInsert ? (text) => onInsert(panel, text) : undefined}
            />
          </article>
        )
      })}
    </div>
  )
}
