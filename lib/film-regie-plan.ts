import { regieJson } from './ai.js'
import { imagePartFromUrl, type InlinePart } from './film-image-parts.js'
import {
  regiebuchForPlanning,
  readRegiePlan,
  REGIE_PLAN_MAX_REFS,
  type RegiePlanRead,
  type RegieRefOption,
} from '../shared/film-regie-plan.js'
import type { FilmContinuity } from '../shared/film-continuity.js'

const PLAN = `Du bist die Regie einer Bildergeschichte. Du planst genau EIN Bild, bevor es gemalt wird.
Du hast dein Regiebuch, die Sätze zu diesem Bild, die Sätze davor und danach, was in den früheren Bildern gezeigt wurde, und eine Liste von Vorlagen-Fotos.
Es gibt keine festen Regeln für bestimmte Lagen. Du verstehst aus dem Dialog und dem Regiebuch, wo die Leute sind, wer körperlich wo ist und was die Kamera zeigt.
Steht vor einem Satz «Handlung», «Erzähler», «Off» oder ähnlich, ist das keine Person, sondern eine Regieanweisung oder Erzählung. Lies, was passiert, und entscheide selbst, wer oder was zu sehen ist.
Entscheide:
- place: an welchem Ort dieses Bild spielt. Nimm den Namen aus dem Regiebuch, wenn der Ort dort steht. Ein Raum ist ein Ort: ein Detail, ein Gegenstand (Karte, Bild an der Wand) oder eine andere Blickrichtung im selben Raum ist kein neuer Ort, sondern der Name des Raums aus dem Regiebuch. Braucht die Geschichte einen Ort, der im Regiebuch fehlt (zum Beispiel einen zweiten Raum), gib ihm einen kurzen neuen Namen und beschreibe ihn in placeLookEn auf Englisch (Wände, Möbel, was an welcher Wand ist), sonst bleibt placeLookEn leer. Zwei Leute an verschiedenen Orten haben zwei verschiedene Orte.
  place ist immer der Raum, in dem die Kamera steht. Alles um die Leute und um die Geräte herum (Wände, Boden, Möbel) gehört zu diesem Ort.
- bodies: wer an diesem Ort körperlich im Bild ist.
- screens: wer nur auf einem Bildschirm oder Foto im Bild zu sehen ist (leer, wenn niemand). Wer auf einem Bildschirm ist, ist dort an seinem eigenen Ort: hinter ihm sieht man seinen Raum, nicht den Raum, in dem der Bildschirm steht.
- surfaces: jede Fläche im Bild, auf der etwas anderes zu sehen ist als der Raum der Kamera (Bildschirm, Fernseher, Telefon, Spiegel, Anzeigetafel, Foto, Leinwand). Für jede: thing (welches Gerät oder welcher Rahmen, kurz, deutsch), people (wer darauf zu sehen ist), place (welcher Ort darauf zu sehen ist, Name aus dem Regiebuch, leer wenn keiner), showsEn (was darauf zu sehen ist, englisch, konkret). Leer, wenn es keine solche Fläche gibt. Wer auf einer Fläche ist, steht nicht in bodies.
- wo die Kamera steht und wohin sie schaut. Was dann hinter den Leuten zu sehen ist, folgt aus der Beschreibung des Ortes: schaut die Kamera in die andere Richtung, sieht man die gegenüberliegende Wand.
- cameraEn: ein englischer Satz mit Kamera-Standort, Richtung (von vorne, von der Seite, von hinten), Nähe und wohin jede Person schaut. Der Maler bekommt ihn am Schluss noch einmal.
- sameFraming: true nur, wenn dieses Bild absichtlich fast gleich aussehen soll wie das vorige Bild. Sonst false.
- wohin die Leute schauen: zu ihrem Gegenüber oder auf das, womit sie beschäftigt sind. Nicht zum Zuschauer, ausser der Satz spricht den Zuschauer an. Niemand posiert für ein Foto.
- Gesichtsausdruck und Handlung passend zum Satz.
- Dinge, die schon in früheren Bildern an diesem Ort waren, bleiben gleich und am gleichen Platz.
Die Einstellung vom Board (weit, nah, Detail) ist ein Vorschlag. Du darfst abweichen, wenn der Satz etwas anderes braucht.
Neue Bilder sollen sich vom vorigen Bild unterscheiden, wenn die Geschichte weitergeht (anderer Blick, andere Person im Fokus).
Vorlagen: wähle höchstens ${REGIE_PLAN_MAX_REFS} aus der Liste, nur die, die dem Maler helfen. Schreibe zu jeder in useEn, wofür der Maler sie benutzen soll und wofür nicht.
Beispiele für useEn: "Lena's face, hair and clothes only, ignore the background", "same room as this picture, but the camera now faces the opposite wall".
Ein früheres Bild von einem ANDEREN Ort nimmst du nie als Raum-Vorlage. Hat die Regie in einem früheren Bild einen Fehler am Raum gefunden, nimmst du es nicht als Raum-Vorlage; bei einem anderen Fehler höchstens für den Raum.
Die Vorlagen sind als kleine Bilder angehängt, in der Reihenfolge der Liste. Schau sie an: so sind die früheren Bilder wirklich geworden. Ist ein früheres Bild anders geraten als geplant (anderer Raum, Fenster an einer anderen Wand, andere Seite), nimm es nicht als Raum-Vorlage und halte dich an das Regiebuch.
Braucht dieser Satz eine neue Handlung, einen neuen Ausdruck oder einen neuen Blick, nimmst du das vorige Bild nicht als Vorlage für Bildaufbau oder Haltung. Höchstens für Aussehen oder Raum, und dann steht in useEn: "do not copy pose or framing".
paintEn ist der ganze Auftrag an den Maler, auf Englisch, konkret, mit Namen: der Raum, wer wo ist, Kamera-Standort und Blickrichtung, was im Hintergrund zu sehen ist, Blickrichtung der Leute, Ausdruck, Handlung, Gegenstände, und was auf jeder Fläche zu sehen ist.
cameraDe ist ein kurzer deutscher Satz für Jean-Marie, ohne Fachwörter, z.B. "Nah auf Amir, von vorne. Hinter ihm das Bücherregal."
Nur ein JSON-Objekt:
{ "place": "", "placeLookEn": "", "bodies": [], "screens": [], "surfaces": [{ "thing": "", "people": [], "place": "", "showsEn": "" }], "cameraDe": "", "cameraEn": "", "sameFraming": false, "paintEn": "", "refs": [{ "id": "V1", "useEn": "" }] }`

/** Kleine Bilder der Vorlagen für die Regie: billig (höchstens 384 Pixel) und nicht zu viele. */
export const PLAN_THUMB_WIDTH = 384
export const PLAN_THUMBS_MAX = 10

/** Plant ein Bild. Gelingt es nicht, steht der Grund auf Deutsch in errorDe — nie still. */
export async function planStoryPicture(opts: {
  continuity: FilmContinuity
  linesDe: string
  beforeDe: string
  afterDe: string
  shotDe: string
  earlierDe: string
  options: RegieRefOption[]
}): Promise<RegiePlanRead> {
  const shown = opts.options.slice(-PLAN_THUMBS_MAX)
  const thumbs = await Promise.all(
    shown.map((option) => imagePartFromUrl(option.url, { timeoutMs: 8_000, maxWidth: PLAN_THUMB_WIDTH })),
  )
  const images: InlinePart[] = []
  const thumbIds: string[] = []
  thumbs.forEach((part, index) => {
    if (!part) return
    images.push(part)
    thumbIds.push(shown[index]!.id)
  })
  const ask = [
    `REGIEBUCH:\n${regiebuchForPlanning(opts.continuity)}`,
    `DAVOR:\n${opts.beforeDe || '—'}`,
    `SÄTZE ZU DIESEM BILD:\n${opts.linesDe || '—'}`,
    `DANACH:\n${opts.afterDe || '—'}`,
    `VORSCHLAG VOM BOARD: ${opts.shotDe}`,
    `FRÜHERE BILDER:\n${opts.earlierDe || '— (das ist das erste Bild)'}`,
    `VORLAGEN:\n${opts.options.map((option) => `${option.id}: ${option.aboutDe}`).join('\n') || '— (keine)'}`,
    thumbIds.length ? `ANGEHÄNGTE BILDER der Reihe nach: ${thumbIds.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  let raw: unknown
  try {
    raw = await regieJson<unknown>(PLAN, ask, images, {
      temperature: 0.3,
      timeoutMs: 120_000,
      timeoutMessage: 'Die Regie hat länger als zwei Minuten gebraucht.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message.trim() : ''
    return { errorDe: message.slice(0, 200) || 'Die Regie hat nicht geantwortet.' }
  }
  return readRegiePlan(raw, {
    places: opts.continuity.places.map((place) => place.name),
    people: opts.continuity.people.map((person) => person.name),
    options: opts.options,
  })
}
