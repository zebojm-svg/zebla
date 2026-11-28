import { useState } from 'react'
import { api } from '../api/client'
import type { Dialog } from '../types'
import type { FilmStoryboard } from '../../shared/film-storyboard'
import { regieModelLineDe } from '../../shared/regie-model'
import {
  placesTooAlike,
  regiebuchFromContinuity,
  tidyContinuity,
  type RegiebuchEdit,
} from '../../shared/film-continuity'
import {
  placesMissingRoomPlate,
  roomPlateFor,
  roomPlateStateDe,
} from '../../shared/film-room-plate'

const EMPTY: RegiebuchEdit = { situationDe: '', people: [], places: [], notesDe: [] }

function regiebuchFailDe(kind: 'read' | 'save', reason: string): string {
  const said = reason.trim().replace(/[.\s]+$/, '')
  const why = /failed to fetch|networkerror|load failed|network request failed/i.test(said)
    ? 'Die Verbindung zum Server ist abgebrochen'
    : said || 'Grund unbekannt'
  return kind === 'read'
    ? `Die Regie konnte die Geschichte nicht lesen: ${why}. Das bisherige Regiebuch bleibt.`
    : `Die Regie konnte deine Änderung nicht übernehmen: ${why}. Das bisherige Regiebuch bleibt. Deine Änderung steht noch hier — bitte noch einmal speichern.`
}

export function FilmRegiebuch({
  dialogId,
  board,
  disabled,
  styleId,
  onApplied,
}: {
  dialogId: string
  board: FilmStoryboard
  disabled: boolean
  styleId?: string
  onApplied: (dialog: Dialog, board: FilmStoryboard) => void
}) {
  const note = board.continuity ? tidyContinuity(board.continuity) : undefined
  const [draft, setDraft] = useState<{ book: RegiebuchEdit; notesText: string } | null>(null)
  const [busy, setBusy] = useState<'' | 'read' | 'save' | `plate:${string}`>('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [plateHints, setPlateHints] = useState<Record<string, string>>({})
  const dirty = draft !== null
  const book = draft?.book ?? (note ? regiebuchFromContinuity(note) : EMPTY)
  const notesText = draft?.notesText ?? (note?.notesDe ?? []).join('\n')

  const needsGerman =
    Boolean(note) &&
    [...(note?.people ?? []), ...(note?.places ?? [])].some((item) => !item.lookDe?.trim())

  const alike = note ? placesTooAlike(note.places) : []
  const missingPlates = placesMissingRoomPlate(note?.places, note?.plates)

  const call = async (kind: 'read' | 'save') => {
    setBusy(kind)
    setError('')
    setStatus(kind === 'read' ? 'Die Regie liest die Geschichte … (kann bis zu 2½ Minuten dauern)' : 'Die Regie übernimmt deine Änderung …')
    try {
      const edit: RegiebuchEdit | undefined =
        kind === 'save'
          ? {
              ...book,
              notesDe: notesText
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            }
          : undefined
      const result = await api.ai.filmRegiebuch(dialogId, edit ? { edit } : { fresh: true })
      if (result.errorDe) {
        setStatus('')
        setError(regiebuchFailDe(kind, result.errorDe))
        return
      }
      setDraft(null)
      onApplied(result.dialog, result.board)
      setStatus(
        kind === 'read'
          ? 'Die Regie hat die Geschichte gelesen.'
          : 'Gespeichert. Die nächsten Bilder halten sich daran.',
      )
    } catch (err) {
      setStatus('')
      setError(regiebuchFailDe(kind, err instanceof Error ? err.message : 'Grund unbekannt'))
    } finally {
      setBusy('')
    }
  }

  const redrawPlate = async (placeName: string) => {
    const busyKey = `plate:${placeName}` as const
    setBusy(busyKey)
    setError('')
    setStatus(`Raumbild «${placeName}» …`)
    try {
      const hint = plateHints[placeName]?.trim()
      const result = await api.ai.filmRoomPlate(dialogId, placeName, hint || undefined, styleId)
      onApplied(result.dialog, result.board)
      setStatus(result.noteDe)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das Raumbild konnte nicht gezeichnet werden.')
      setStatus('')
    } finally {
      setBusy('')
    }
  }

  const change = (next: RegiebuchEdit) => setDraft({ book: next, notesText })

  const locked = disabled || busy !== ''

  return (
    <details className="film-regiebuch" open>
      <summary>Regiebuch</summary>
      <p className="muted">
        Das hat die Regie aus dem Dialog verstanden. Stimmt etwas nicht, schreib es hier hinein und
        speichere. Die nächsten Bilder halten sich daran.
      </p>

      {!note ? (
        <p className="muted">Die Regie hat die Geschichte noch nicht gelesen.</p>
      ) : (
        <>
          {note.readModel ? (
            <p className="muted">Gelesen — {regieModelLineDe(note.readModel, note.readModelNoteDe)}</p>
          ) : null}
          {needsGerman ? (
            <p className="alert alert-warn">
              Dieses Regiebuch ist noch aus der Zeit vor dem Deutschen. «Neu lesen» schreibt es auf
              Deutsch.
            </p>
          ) : null}

          {alike.length && !dirty ? (
            <p className="alert alert-warn">
              Die Zimmer {alike.map(([a, b]) => `«${a}» und «${b}»`).join(', ')} sehen fast gleich aus.
              Drück «Neu lesen», damit die Regie sie unterscheidet.
            </p>
          ) : null}

          {missingPlates.length ? (
            <p className="alert alert-warn">
              Noch kein Raumbild für: {missingPlates.map((name) => `«${name}»`).join(', ')}. Beim
              «Szene erzeugen» zeichnet Zebla sie zuerst — oder unten beim Ort «Raumbild zeichnen».
            </p>
          ) : null}

          <label className="film-regiebuch-field">
            <span>Wo und wie</span>
            <textarea
              rows={2}
              value={book.situationDe}
              disabled={locked}
              onChange={(e) => change({ ...book, situationDe: e.target.value })}
            />
          </label>

          {book.people.length ? <h3>Personen</h3> : null}
          {book.people.map((person, index) => (
            <label key={`p-${person.name}`} className="film-regiebuch-field">
              <span>{person.name}</span>
              <textarea
                rows={2}
                value={person.lookDe}
                disabled={locked}
                onChange={(e) =>
                  change({
                    ...book,
                    people: book.people.map((item, i) =>
                      i === index ? { ...item, lookDe: e.target.value } : item,
                    ),
                  })
                }
              />
            </label>
          ))}

          {book.places.length ? <h3>Orte</h3> : null}
          {book.places.map((place, index) => {
            const plate = roomPlateFor(note.plates, place.name)
            const plateBusy = busy === `plate:${place.name}`
            return (
              <div key={`o-${place.name}`} className="film-regiebuch-place">
                <label className="film-regiebuch-field">
                  <span>{place.name}</span>
                  <textarea
                    rows={2}
                    value={place.lookDe}
                    disabled={locked}
                    onChange={(e) =>
                      change({
                        ...book,
                        places: book.places.map((item, i) =>
                          i === index ? { ...item, lookDe: e.target.value } : item,
                        ),
                      })
                    }
                  />
                </label>
                <div className="film-room-plate-row">
                  {plate?.url ? (
                    <a href={plate.url} target="_blank" rel="noreferrer" className="film-room-plate-thumb">
                      <img src={plate.url} alt="" width={120} height={68} />
                    </a>
                  ) : (
                    <p className="muted">Noch kein Raumbild.</p>
                  )}
                  <div className="film-room-plate-actions">
                    <p className="muted">{roomPlateStateDe(plate)}</p>
                    <input
                      className="input"
                      disabled={locked}
                      placeholder="Hinweis fürs Neuzeichnen (optional)"
                      value={plateHints[place.name] ?? ''}
                      onChange={(e) => setPlateHints((prev) => ({ ...prev, [place.name]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={locked}
                      onClick={() => void redrawPlate(place.name)}
                    >
                      {plateBusy ? '…' : plate ? 'Raumbild ändern' : 'Raumbild zeichnen'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          <label className="film-regiebuch-field">
            <span>Was sonst gilt (eine Sache pro Zeile)</span>
            <textarea
              rows={3}
              value={notesText}
              disabled={locked}
              placeholder="Amir trägt die ganze Zeit ein Headset."
              onChange={(e) => setDraft({ book, notesText: e.target.value })}
            />
          </label>

          {note.shots.length ? (
            <details className="film-regiebuch-shots">
              <summary>Welches Bild woran anschliesst</summary>
              <ol>
                {note.shots.map((shot) => (
                  <li key={shot.panelId}>{shot.whyDe}</li>
                ))}
              </ol>
            </details>
          ) : null}
        </>
      )}

      {status ? <p className="film-cast-voices-status">{status}</p> : null}
      {error ? <p className="alert alert-error">{error}</p> : null}

      <div className="film-scene-toolbar">
        {note ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={locked || !dirty}
            onClick={() => void call('save')}
          >
            {busy === 'save' ? '…' : 'Regiebuch speichern'}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={locked}
          onClick={() => {
            if (note?.byUser && !window.confirm('Die Regie liest den Dialog neu. Deine Änderungen bleiben als Vorgabe. Weiter?')) return
            void call('read')
          }}
        >
          {busy === 'read' ? '…' : note ? 'Neu lesen' : 'Regie lesen lassen'}
        </button>
      </div>
    </details>
  )
}