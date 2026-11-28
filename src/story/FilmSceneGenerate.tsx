import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  STORY_ART_STYLES,
  rememberStyleChoice,
  type StoryArtStyleId,
} from '../../shared/story-art-styles'
import type { Dialog } from '../types'
import { inferDialogLineKind, isStageSpeaker } from '../types'
import { LineLanguageLayers } from '../components/LineLanguageLayers'
import type { FilmScene, FilmStoryboard, FilmStoryboardPanel } from '../../shared/film-storyboard'
import {
  isFilmStoryboard,
  normalizeFilmStoryboard,
  panelAddressee,
  panelDialogueLines,
  type FilmPanelDialogueLine,
} from '../../shared/film-storyboard'
import { stillPackNumber } from '../../shared/film-still-pack'
import { packSpeakerChoices } from '../../shared/speakers'
import { sceneHarvestNotesDe } from '../../shared/film-library-harvest'
import { regiePlanErrorLineDe, regiePlanPlacesDe, type RegieAttempt } from '../../shared/film-regie-plan'
import { regieCheckState } from '../../shared/film-regie-judge'
import { regieModelLineDe } from '../../shared/regie-model'
import {
  gazeNoteDe,
  sceneGrundbildPanel,
  sceneStillProgress,
  seatingNoteDe,
  stillLibraryHintDe,
} from '../../shared/film-stills'
import { placesMissingRoomPlate } from '../../shared/film-room-plate'
import { sceneReviewRedoIds, sceneReviewSummaryDe } from '../../shared/film-scene-review'
import { FilmStillPicture } from './FilmStillArrange'
import { FilmDetails } from './FilmDetails'
import {
  attemptSummaryLineDe,
  printTruncateLines,
  regiePlanSummaryDe,
} from '../../shared/film-print'

export function FilmStyleTabs({
  value,
  disabled,
  onChange,
  lead = 'Zeichenstil für neue Szenen',
}: {
  value: string
  disabled?: boolean
  lead?: string
  onChange: (id: StoryArtStyleId) => void
}) {
  return (
    <div className="film-style-tabs">
      <p className="muted film-style-lead">{lead}</p>
      <div className="film-style-tab-row" role="tablist" aria-label="Zeichenstil">
        {STORY_ART_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            role="tab"
            aria-selected={value === style.id}
            className={`film-style-tab${value === style.id ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => {
              rememberStyleChoice()
              onChange(style.id)
            }}
          >
            {style.label}
          </button>
        ))}
      </div>
    </div>
  )
}

type Props = {
  dialogId: string
  scene: FilmScene
  panels: FilmStoryboardPanel[]
  board?: FilmStoryboard | null
  styleId: string
  onStyleChange: (styleId: string) => void
  busy: boolean
  extraDisabled?: boolean
  progress?: { current: number; total: number } | null
  error?: string
  status?: string
  onGenerate: (force: boolean, skipPlates?: boolean) => void
  onPreparePlates?: () => void
  onReview?: () => void
  onRepaintReview?: () => void
  onRematch?: () => void
  shotPlanDe?: string
  expectedShots?: number
  /** Anhalten: der laufende Schritt läuft fertig, dann hört die Szene auf. */
  onStop?: () => void
  stopping?: boolean
  stoppedNote?: string
}

export function FilmSceneGenerateBar({
  dialogId,
  scene,
  panels,
  board,
  styleId,
  busy,
  extraDisabled,
  progress,
  error,
  status,
  onGenerate,
  onPreparePlates,
  onReview,
  onRepaintReview,
  onRematch,
  shotPlanDe,
  expectedShots,
  onStop,
  stopping,
  stoppedNote,
}: Props) {
  const stats = sceneStillProgress(panels, styleId)
  const hint = stillLibraryHintDe(panels)
  const harvestNotes = sceneHarvestNotesDe(panels)
  const allDone = stats.total > 0 && stats.pending === 0
  const paintingOne = Boolean(busy && progress && progress.total === 1)
  const missingPlates = placesMissingRoomPlate(board?.continuity?.places, board?.continuity?.plates)
  const review = scene.sceneReview
  const reviewBad = sceneReviewRedoIds(review)
  const label = busy
    ? paintingOne
      ? 'Bild wird neu gemalt …'
      : progress && progress.current > 0
        ? `Erzeuge Szene … Bild ${progress.current} von ${progress.total}`
        : 'Erzeuge Szene …'
    : allDone
      ? 'Szene neu erzeugen'
      : stats.done > 0
        ? 'Szene weiter erzeugen'
        : 'Diese Szene erzeugen'

  return (
    <div className="film-scene-generate">
      <button
        type="button"
        className="btn btn-story-studio film-scene-make"
        disabled={busy || extraDisabled || stats.total === 0}
        onClick={() => {
          if (missingPlates.length && !allDone) {
            if (
              !window.confirm(
                `Ohne Raumbild kann sich die Einrichtung ändern: ${missingPlates.map((n) => `«${n}»`).join(', ')}. Trotzdem ohne Raumbild starten?`,
              )
            ) {
              return
            }
            onGenerate(allDone, true)
            return
          }
          onGenerate(allDone, false)
        }}
      >
        {label}
      </button>
      {!busy && missingPlates.length && !allDone && onPreparePlates ? (
        <button type="button" className="btn btn-secondary" disabled={extraDisabled} onClick={onPreparePlates}>
          Raumbilder zuerst zeichnen
        </button>
      ) : null}
      {!busy && stats.done > 0 && !allDone ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={extraDisabled}
          onClick={() => onGenerate(true)}
        >
          Ganze Szene neu erzeugen
        </button>
      ) : null}
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
          {!paintingOne && status ? ` ${status}` : ''}
          {!paintingOne && onStop ? (
            <>
              {' '}
              <button type="button" className="btn btn-secondary" disabled={stopping} onClick={onStop}>
                {stopping ? 'Wird angehalten …' : 'Anhalten'}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {!busy && stoppedNote ? <p className="alert alert-info">{stoppedNote}</p> : null}
      {!busy && allDone && onReview ? (
        <div className="film-scene-review-bar">
          <button type="button" className="btn btn-secondary" disabled={extraDisabled || busy} onClick={onReview}>
            Szene prüfen
          </button>
          {review ? (
            <p className={review.ok ? 'muted' : 'alert alert-warn'}>{sceneReviewSummaryDe(review)}</p>
          ) : null}
          {reviewBad.length && onRepaintReview ? (
            <button type="button" className="btn btn-secondary" disabled={extraDisabled || busy} onClick={onRepaintReview}>
              Nur markierte Bilder neu malen ({reviewBad.length})
            </button>
          ) : null}
        </div>
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
  hideSpeaker,
}: {
  lines: FilmPanelDialogueLine[]
  targetLanguage?: string
  sourceLanguage?: string
  nativeSlotFor?: (line: FilmPanelDialogueLine) => ReactNode
  hideSpeaker?: boolean
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
            speaker={hideSpeaker ? undefined : line.speaker}
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

function packIsSilent(lines: FilmPanelDialogueLine[], panel: FilmStoryboardPanel): boolean {
  const line = lines[0]
  if (!line) return !panel.closeupSpeaker
  const kind = line.kind ?? inferDialogLineKind({
    speaker: line.speaker,
    text: line.text,
    kind: line.kind,
  })
  return kind === 'action' || isStageSpeaker(line.speaker)
}

export function FilmPackSpeakerSelect({
  dialog,
  panel,
  lines,
  busy,
  onChange,
}: {
  dialog: Dialog
  panel: FilmStoryboardPanel
  lines: FilmPanelDialogueLine[]
  busy?: boolean
  onChange: (speaker: string) => void
}) {
  const silent = packIsSilent(lines, panel)
  const current = silent ? '' : (lines[0]?.speaker || panel.closeupSpeaker || '').trim()
  const extras = [
    current,
    panel.closeupSpeaker,
    ...panel.placements.map((pl) => pl.name),
  ].filter(Boolean) as string[]
  const choices = packSpeakerChoices(dialog, extras)
  return (
    <label className="film-pack-field">
      <span className="film-beat-col-label">Sprecher</span>
      <select
        className="input"
        value={current}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">keiner (stumm)</option>
        {choices.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

function FilmPackTextarea({
  value,
  disabled,
  placeholder,
  onChange,
  onBlur,
}: {
  value: string
  disabled?: boolean
  placeholder: string
  onChange: (next: string) => void
  onBlur: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fitHeight = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 44)}px`
  }, [])
  useLayoutEffect(() => {
    fitHeight()
  }, [value, fitHeight])
  return (
    <textarea
      ref={ref}
      className="input film-pack-textarea"
      rows={1}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onInput={fitHeight}
      onBlur={onBlur}
    />
  )
}

export function FilmPackFields({
  panel,
  busy,
  onSave,
}: {
  panel: FilmStoryboardPanel
  busy?: boolean
  onSave?: (fields: { imageCue?: string; directorNote?: string; soundCue?: string }) => void
}) {
  const [handlung, setHandlung] = useState(panel.imageCue ?? '')
  const [regie, setRegie] = useState(panel.directorNote ?? '')
  const [soundCue, setSoundCue] = useState(panel.soundCue ?? '')
  useEffect(() => {
    setHandlung(panel.imageCue ?? '')
    setRegie(panel.directorNote ?? '')
    setSoundCue(panel.soundCue ?? '')
  }, [panel.id, panel.imageCue, panel.directorNote, panel.soundCue])
  if (!onSave) return null
  return (
    <div className="film-pack-fields">
      <label className="film-pack-field">
        <span className="film-beat-col-label">Handlung</span>
        <FilmPackTextarea
          value={handlung}
          disabled={busy}
          placeholder="z.B. Ramo stellt Teetassen und ein Tablett bereit"
          onChange={setHandlung}
          onBlur={() => {
            if (handlung.trim() !== (panel.imageCue ?? '').trim()) onSave({ imageCue: handlung })
          }}
        />
      </label>
      <label className="film-pack-field">
        <span className="film-beat-col-label">Regie</span>
        <FilmPackTextarea
          value={regie}
          disabled={busy}
          placeholder="z.B. Kamera auf den Herd, Ramo von der Seite"
          onChange={setRegie}
          onBlur={() => {
            if (regie.trim() !== (panel.directorNote ?? '').trim()) onSave({ directorNote: regie })
          }}
        />
      </label>
      <label className="film-pack-field">
        <span className="film-beat-col-label">Ton</span>
        <FilmPackTextarea
          value={soundCue}
          disabled={busy}
          placeholder="z.B. Wasser läuft, Kessel pfeift"
          onChange={setSoundCue}
          onBlur={() => {
            if (soundCue.trim() !== (panel.soundCue ?? '').trim()) onSave({ soundCue })
          }}
        />
      </label>
    </div>
  )
}

export function FilmPackActions({
  busy,
  canRemove,
  onRemove,
  onInsert,
}: {
  busy?: boolean
  canRemove?: boolean
  onRemove?: () => void
  onInsert?: (text: string) => void
}) {
  const [insertText, setInsertText] = useState('')
  if (!onRemove && !onInsert) return null
  return (
    <div className="film-pack-actions">
      {onInsert ? (
        <div className="film-tweak">
          <input
            className="input"
            value={insertText}
            disabled={busy}
            placeholder="Neues Päckchen danach, z.B. Ramo am Herd"
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
            Danach einfügen
          </button>
        </div>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || canRemove === false}
          onClick={() => {
            if (window.confirm('Dieses Bild-Päckchen löschen?')) onRemove()
          }}
        >
          Löschen
        </button>
      ) : null}
    </div>
  )
}

/** Unter jedem Bild: was die Regie geplant hat — oder warum sie nicht planen konnte. */
export function FilmRegiePlanNote({ panel }: { panel: FilmStoryboardPanel }) {
  if (panel.regiePlan?.cameraDe) {
    const places = regiePlanPlacesDe(panel.regiePlan)
    return (
      <p className="muted">
        Regie: {panel.regiePlan.cameraDe}
        {places ? (
          <>
            <br />
            {places}
          </>
        ) : null}
      </p>
    )
  }
  if (panel.regiePlanError) {
    return <p className="alert alert-warn">{regiePlanErrorLineDe(panel.regiePlanError)}</p>
  }
  return null
}

/** Unter jedem Bild: was die Regie beim Anschauen gefunden hat. «Nicht geprüft» sieht anders aus als «passt». */
export function FilmRegieCheckNote({ panel }: { panel: FilmStoryboardPanel }) {
  const paintedWithRegie = (panel.regieAttempts ?? []).some((attempt) => attempt.stillUrl === panel.stillUrl)
  const state = regieCheckState(panel.regieCheck, panel.stillUrl, paintedWithRegie)
  const check = panel.regieCheck
  if (state === 'keins') return null
  const modelNote =
    check?.stillUrl === panel.stillUrl && check?.modelNoteDe ? <> {check.modelNoteDe}</> : null
  if (state === 'ungeprueft') {
    return (
      <p className="alert alert-info">
        Regie: nicht geprüft.{' '}
        {check?.stillUrl === panel.stillUrl && check?.noteDe
          ? check.noteDe.replace(/^Nicht geprüft:\s*/, '')
          : 'Angehalten oder die Verbindung war weg.'}{' '}
        Das Bild kann Fehler haben.{modelNote}
      </p>
    )
  }
  if (state === 'passt') {
    return (
      <p className="muted">
        Regie: passt.{check?.softDe ? <> Kleinigkeit: {check.softDe}</> : null}{modelNote}
      </p>
    )
  }
  return (
    <p className="alert alert-warn">
      Regie: {check?.noteDe} Schreib unter dem Bild, was anders sein soll.
      {check?.softDe ? <> Kleinigkeit: {check.softDe}</> : null}{modelNote}
    </p>
  )
}

function attemptVerdictDe(verdict: RegieAttempt['verdict']): string {
  if (!verdict) return 'Regie hat nicht angeschaut.'
  const model = verdict.model ? ` (${regieModelLineDe(verdict.model, verdict.modelNoteDe)})` : ''
  if (verdict.unchecked) return `Regie: ${verdict.noteDe}${model}`
  const soft = verdict.softDe ? ` Kleinigkeit: ${verdict.softDe}` : ''
  return verdict.ok ? `Regie: passt.${soft}${model}` : `Regie: ${verdict.noteDe}${soft}${model}`
}

function HistoryThumb({ url, children }: { url: string; children: ReactNode }) {
  return (
    <figure>
      <a href={url} target="_blank" rel="noreferrer" title="Gross öffnen">
        <img src={url} alt="" loading="lazy" />
      </a>
      <figcaption>{children}</figcaption>
    </figure>
  )
}

/** Unter «Mehr» im Druck: nur Kurzfassung Plan + Urteil der Regie. */
export function FilmStillMehrCompact({ panel }: { panel: FilmStoryboardPanel }) {
  const planLine = regiePlanSummaryDe(panel)
  const paintedWithRegie = (panel.regieAttempts ?? []).some((attempt) => attempt.stillUrl === panel.stillUrl)
  const state = regieCheckState(panel.regieCheck, panel.stillUrl, paintedWithRegie)
  const check = panel.regieCheck
  let verdict = ''
  if (state === 'passt') verdict = `Regie: passt${check?.softDe ? ` — ${check.softDe}` : ''}`
  else if (state === 'fehler' && check?.noteDe) verdict = `Regie: ${check.noteDe}`
  else if (state === 'ungeprueft') verdict = 'Regie: nicht geprüft'
  if (!planLine && !verdict) return null
  return (
    <div className="film-print-mehr-compact">
      {planLine ? <p>{planLine}</p> : null}
      {verdict ? <p className="muted">{verdict}</p> : null}
    </div>
  )
}

/** Unter jedem Bild, zugeklappt: Plan, Vorlagen und jeder Malversuch mit dem Urteil der Regie. */
export function FilmStillHistory({
  panel,
  compact,
  verbose,
  openOverride,
}: {
  panel: FilmStoryboardPanel
  /** Druck: weniger Bilder und Zeilen */
  compact?: boolean
  /** Druck: volle Prompts statt Kürzung */
  verbose?: boolean
  openOverride?: boolean
}) {
  const plan = panel.regiePlan
  const attempts = panel.regieAttempts ?? []
  if (!plan && attempts.length === 0) return null
  const lastRefs = attempts[attempts.length - 1]?.refs ?? []
  const refs = lastRefs.length ? lastRefs : (plan?.refs ?? [])
  const seenUrls = new Set<string>()
  const uniqueRefs = refs.filter((ref) => {
    if (seenUrls.has(ref.url)) return false
    seenUrls.add(ref.url)
    return true
  })

  if (compact && !verbose) {
    return (
      <FilmDetails className="film-scene-more" summary="So ist das Bild entstanden" openOverride={openOverride}>
        {plan ? <p className="film-print-plan-one">{regiePlanSummaryDe(panel)}</p> : null}
        {panel.regiePlanError && !plan ? (
          <p className="muted">{regiePlanErrorLineDe(panel.regiePlanError)}</p>
        ) : null}
        {uniqueRefs.length ? (
          <ul className="film-print-ref-lines">
            {uniqueRefs.map((ref) => (
              <li key={ref.url}>{printTruncateLines(ref.useEn, 2, 200)}</li>
            ))}
          </ul>
        ) : null}
        {attempts.length ? (
          <ul className="film-print-attempt-lines">
            {attempts.map((attempt, index) => (
              <li key={`${attempt.at}-${index}`}>{attemptSummaryLineDe(attempt, index, true)}</li>
            ))}
          </ul>
        ) : null}
      </FilmDetails>
    )
  }

  return (
    <FilmDetails className="film-scene-more" summary="So ist das Bild entstanden" openOverride={openOverride}>
      {plan ? (
        <>
          <h4>Plan der Regie</h4>
          <p>
            {plan.place ? <>Ort der Kamera: {plan.place}. </> : null}
            Im Raum: {plan.bodies.length ? plan.bodies.join(', ') : 'niemand'}.
            {plan.surfaces?.length
              ? plan.surfaces.map((surface) => (
                  <span key={surface.thing}>
                    {' '}
                    Auf {surface.thing}: {[surface.people.join(', '), surface.contentDe].filter(Boolean).join(' — ') || 'etwas zu sehen'}
                    {surface.place ? ` (${surface.place})` : ''}.
                  </span>
                ))
              : plan.screens.length
                ? <> Nur auf einem Bildschirm: {plan.screens.join(', ')}.</>
                : null}
            {plan.sameFraming ? <> Absichtlich derselbe Blick wie das vorige Bild.</> : null}
          </p>
          <p>Kamera: {plan.cameraDe}</p>
          {plan.model ? <p className="muted">Geplant — {regieModelLineDe(plan.model, plan.modelNoteDe)}</p> : null}
        </>
      ) : panel.regiePlanError ? (
        <p className="muted">{regiePlanErrorLineDe(panel.regiePlanError)}</p>
      ) : null}
      {refs.length ? (
        <>
          <h4>Mitgeschickt an den Maler (und wofür, englisch)</h4>
          <div className="film-still-history-grid">
            {(compact ? uniqueRefs : refs).map((ref) => (
              <HistoryThumb key={ref.url} url={ref.url}>
                {compact ? printTruncateLines(ref.useEn, 4) : ref.useEn}
              </HistoryThumb>
            ))}
          </div>
        </>
      ) : null}
      {attempts.length ? (
        compact ? (
          <ul className="film-print-attempt-lines">
            {attempts.map((attempt, index) => (
              <li key={`${attempt.at}-${index}`}>{attemptSummaryLineDe(attempt, index, !verbose)}</li>
            ))}
          </ul>
        ) : (
          <>
            <h4>Versuche</h4>
            <div className="film-still-history-grid">
              {attempts.map((attempt, index) => (
                <HistoryThumb key={`${attempt.at}-${index}`} url={attempt.stillUrl}>
                  <strong>Versuch {index + 1}</strong> — {attempt.planned ? 'nach Plan' : 'ohne Plan'}
                  {attempt.hintDe ? <> · Dein Hinweis: {attempt.hintDe}</> : null}
                  {attempt.fixEn ? (
                    <>
                      {' '}
                      · Auftrag der Regie an den Maler:{' '}
                      {verbose ? attempt.fixEn : printTruncateLines(attempt.fixEn, 4)}
                    </>
                  ) : null}
                  <br />
                  {attemptVerdictDe(attempt.verdict)}
                  {attempt.copyOf ? <> · Fast gleich wie ein früheres Bild.</> : null}
                  {attempt.verdict?.seenDe ? (
                    <>
                      <br />
                      <span className="muted">Die Regie sah: {attempt.verdict.seenDe}</span>
                    </>
                  ) : null}
                </HistoryThumb>
              ))}
            </div>
          </>
        )
      ) : null}
    </FilmDetails>
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
  const plan = panel.regiePlan
  if (plan) {
    return (
      <div className="film-beat-notes-list">
        <p>
          <strong>Im Raum</strong> {plan.bodies.length ? plan.bodies.join(', ') : 'niemand'}
        </p>
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
      </div>
    )
  }
  return (
    <div className="film-beat-notes-list">
      {panel.shot === 'closeup' ? (
        <p>
          <strong>Kamera</strong> Nahaufnahme {isStageSpeaker(panel.closeupSpeaker) ? '' : panel.closeupSpeaker || ''} — Kamera wechselt den Platz, man schaut der Person ins Gesicht (nicht nur Kopf drehen)
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
  packNumber,
  picture,
  underPicture,
  lines,
  speakerRow,
  extraFields,
  packActions,
  notes,
  silent,
  targetLanguage,
  sourceLanguage,
  nativeBusy,
  onConfirmNative,
  detailsOpenOverride,
  mehrCompact,
}: {
  packNumber?: number
  picture: ReactNode
  underPicture?: ReactNode
  lines: FilmPanelDialogueLine[]
  speakerRow?: ReactNode
  extraFields?: ReactNode
  packActions?: ReactNode
  notes?: ReactNode
  silent?: boolean
  targetLanguage?: string
  sourceLanguage?: string
  nativeBusy?: boolean
  onConfirmNative?: (lineId: string, nativeText: string) => void
  detailsOpenOverride?: boolean
  /** Druck: «Mehr» nur Kurzfassung */
  mehrCompact?: boolean
}) {
  return (
    <div className="film-beat">
      {packNumber ? (
        <p className="film-beat-pack-num">Bild {packNumber}</p>
      ) : null}
      <div className="film-beat-pic">
        <p className="film-beat-col-label">Bild</p>
        {picture}
        {underPicture}
      </div>
      <div className="film-beat-text">
        {speakerRow}
        {silent ? (
          <p className="muted film-pack-silent">Kein Text — stumm (kein Audio)</p>
        ) : (
          <div className="film-pack-text">
            <p className="film-beat-col-label">Text</p>
            <FilmBeatText
              lines={lines}
              targetLanguage={targetLanguage}
              sourceLanguage={sourceLanguage}
              hideSpeaker={Boolean(speakerRow)}
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
        )}
        {extraFields}
      </div>
      {packActions}
      {notes ? (
        mehrCompact ? (
          <div className="film-beat-regie film-beat-regie--compact">{notes}</div>
        ) : (
          <FilmDetails className="film-beat-regie" summary="Mehr" openOverride={detailsOpenOverride}>
            {notes}
          </FilmDetails>
        )
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
}: {
  panel: FilmStoryboardPanel
  busy: boolean
  error?: string
  status?: string
  onCorrect?: (note: string) => void
}) {
  const [note, setNote] = useState(panel.stillCorrection ?? '')
  const [localError, setLocalError] = useState('')
  if (!onCorrect) return null
  const shownError = error || localError
  return (
    <div className="film-still-fix">
      <div className="film-tweak">
        <input
          className="input"
          value={note}
          disabled={busy}
          placeholder="z.B. wie in Bild 3, Ramo steht am Herd"
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
      <p className="muted film-tweak-hint">
        Nummer steht am Bild. «wie in Bild 3» nimmt genau dieses Foto mit.
      </p>
    </div>
  )
}

export function FilmStillStrip({
  dialogId,
  panels,
  dialog,
  board,
  sceneTitle,
  busy,
  busyPanelId,
  errors,
  status,
  canRemove,
  onCorrect,
  onInsert,
  onRemove,
  onPack,
  onRewrite,
  onLayout,
}: {
  dialogId: string
  panels: FilmStoryboardPanel[]
  dialog?: Dialog | null
  board?: FilmStoryboard | null
  sceneTitle?: string
  busy?: boolean
  busyPanelId?: string | null
  errors?: Record<string, string>
  status?: string
  canRemove?: boolean
  onCorrect?: (panel: FilmStoryboardPanel, note: string) => void
  onInsert?: (panel: FilmStoryboardPanel, text: string) => void
  onRemove?: (panel: FilmStoryboardPanel) => void
  onPack?: (
    panel: FilmStoryboardPanel,
    fields: { speaker?: string | null; imageCue?: string; directorNote?: string; soundCue?: string },
  ) => void
  onRewrite?: (lineId: string, nativeText: string) => Promise<void>
  onLayout?: (dialog: Dialog, board: import('../../shared/film-storyboard').FilmStoryboard) => void
}) {
  if (panels.length === 0) return null
  return (
    <div className="film-still-strip">
      {panels.map((panel, i) => {
        const panelBusy = Boolean(busy && busyPanelId === panel.id)
        const lines = panelDialogueLines(panel, dialog, panels, sceneTitle)
        const silent = packIsSilent(lines, panel)
        const packNumber = board ? stillPackNumber(board, panel) : i + 1
        return (
          <article key={panel.id} className="film-panel">
            <FilmBeatColumns
              packNumber={packNumber}
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
              silent={silent}
              speakerRow={
                dialog && onPack ? (
                  <FilmPackSpeakerSelect
                    dialog={dialog}
                    panel={panel}
                    lines={lines}
                    busy={busy}
                    onChange={(speaker) => onPack(panel, { speaker })}
                  />
                ) : null
              }
              extraFields={
                onPack ? (
                  <FilmPackFields
                    panel={panel}
                    busy={busy}
                    onSave={(fields) => onPack(panel, fields)}
                  />
                ) : null
              }
              packActions={
                <FilmPackActions
                  busy={busy}
                  canRemove={canRemove}
                  onRemove={onRemove ? () => onRemove(panel) : undefined}
                  onInsert={onInsert ? (text) => onInsert(panel, text) : undefined}
                />
              }
              targetLanguage={dialog?.targetLanguage}
              sourceLanguage={dialog?.sourceLanguage}
              onConfirmNative={
                onRewrite
                  ? (lineId, nativeText) => {
                      void onRewrite(lineId, nativeText)
                    }
                  : undefined
              }
              notes={
                <>
                  {panelBusy ? <p className="film-beat-count">wird neu gemalt …</p> : null}
                  <FilmRegiePlanNote panel={panel} />
                  <FilmRegieCheckNote panel={panel} />
                  <FilmBeatNotes panel={panel} dialog={dialog} hideCues />
                  {panel.harvestNoteDe ? (
                    <p className="muted film-harvest-note">{panel.harvestNoteDe}</p>
                  ) : null}
                  <FilmStillHistory panel={panel} />
                </>
              }
            />
          </article>
        )
      })}
    </div>
  )
}
