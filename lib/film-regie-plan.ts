import { regieJson } from './ai.js'
import {
  regiebuchForPlanning,
  sanitizeRegiePlan,
  REGIE_PLAN_MAX_REFS,
  type FilmRegiePlan,
  type RegieRefOption,
} from '../shared/film-regie-plan.js'
import type { FilmContinuity } from '../shared/film-continuity.js'

const PLAN = `Du bist die Regie einer Bildergeschichte. Du planst genau EIN Bild, bevor es gemalt wird.
Du hast dein Regiebuch, die Sätze zu diesem Bild, die Sätze davor und danach, was in den früheren Bildern gezeigt wurde, und eine Liste von Vorlagen-Fotos.
Es gibt keine festen Regeln für bestimmte Lagen. Du verstehst aus dem Dialog und dem Regiebuch, wo die Leute sind, wer körperlich wo ist und was die Kamera zeigt.
Entscheide:
- place: an welchem Ort aus dem Regiebuch dieses Bild spielt. Genau ein Name aus dem Regiebuch.
- bodies: wer an diesem Ort körperlich im Bild ist.
- screens: wer nur auf einem Bildschirm oder Foto im Bild zu sehen ist (leer, wenn niemand).
- wo die Kamera steht und wohin sie schaut. Was dann hinter den Leuten zu sehen ist, folgt aus der Beschreibung des Ortes: schaut die Kamera in die andere Richtung, sieht man die gegenüberliegende Wand.
- wohin die Leute schauen: zu ihrem Gegenüber oder auf das, womit sie beschäftigt sind. Nicht zum Zuschauer, ausser der Satz spricht den Zuschauer an. Niemand posiert für ein Foto.
- Gesichtsausdruck und Handlung passend zum Satz.
- Dinge, die schon in früheren Bildern an diesem Ort waren, bleiben gleich und am gleichen Platz.
Die Einstellung vom Board (weit, nah, Detail) ist ein Vorschlag. Du darfst abweichen, wenn der Satz etwas anderes braucht.
Neue Bilder sollen sich vom vorigen Bild unterscheiden, wenn die Geschichte weitergeht (anderer Blick, andere Person im Fokus).
Vorlagen: wähle höchstens ${REGIE_PLAN_MAX_REFS} aus der Liste, nur die, die dem Maler helfen. Schreibe zu jeder in useEn, wofür der Maler sie benutzen soll und wofür nicht.
Beispiele für useEn: "Lena's face, hair and clothes only, ignore the background", "same room as this picture, but the camera now faces the opposite wall".
Ein früheres Bild von einem ANDEREN Ort nimmst du nie als Raum-Vorlage. Ein früheres Bild, bei dem die Regie einen Fehler gefunden hat, nimmst du nicht.
paintEn ist der ganze Auftrag an den Maler, auf Englisch, konkret, mit Namen: der Raum, wer wo ist, Kamera-Standort und Blickrichtung, was im Hintergrund zu sehen ist, Blickrichtung der Leute, Ausdruck, Handlung, Gegenstände.
cameraDe ist ein kurzer deutscher Satz für Jean-Marie, ohne Fachwörter, z.B. "Nah auf Amir, von vorne. Hinter ihm das Bücherregal."
Nur JSON:
{ "place": "", "bodies": [], "screens": [], "cameraDe": "", "paintEn": "", "refs": [{ "id": "V1", "useEn": "" }] }`

export async function planStoryPicture(opts: {
  continuity: FilmContinuity
  linesDe: string
  beforeDe: string
  afterDe: string
  shotDe: string
  earlierDe: string
  options: RegieRefOption[]
}): Promise<FilmRegiePlan | null> {
  const ask = [
    `REGIEBUCH:\n${regiebuchForPlanning(opts.continuity)}`,
    `DAVOR:\n${opts.beforeDe || '—'}`,
    `SÄTZE ZU DIESEM BILD:\n${opts.linesDe || '—'}`,
    `DANACH:\n${opts.afterDe || '—'}`,
    `VORSCHLAG VOM BOARD: ${opts.shotDe}`,
    `FRÜHERE BILDER:\n${opts.earlierDe || '— (das ist das erste Bild)'}`,
    `VORLAGEN:\n${opts.options.map((option) => `${option.id}: ${option.aboutDe}`).join('\n') || '— (keine)'}`,
  ].join('\n\n')
  try {
    const raw = await regieJson<unknown>(PLAN, ask, [], {
      temperature: 0.3,
      timeoutMs: 90_000,
      timeoutMessage: 'Die Regie hat das Bild nicht rechtzeitig geplant.',
    })
    return sanitizeRegiePlan(raw, {
      places: opts.continuity.places.map((place) => place.name),
      people: opts.continuity.people.map((person) => person.name),
      options: opts.options,
    })
  } catch {
    return null
  }
}
