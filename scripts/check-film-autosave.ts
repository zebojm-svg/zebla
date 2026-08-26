/**
 * Titel-Platzhalter und Timeout-Texte (ohne echte KI).
 * Aufruf: npx tsx scripts/check-film-autosave.ts
 */
import {
  clientTimeoutMessage,
  FILM_PLAN_TIMEOUT_MS,
  isImageGenPath,
} from '../shared/api-timeout.ts'
import {
  displayFilmTitle,
  EMPTY_FILM_TITLE,
  placeholderDraftSection,
  resolvedFilmTitle,
} from '../shared/film-draft.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (FILM_PLAN_TIMEOUT_MS < 100_000 || FILM_PLAN_TIMEOUT_MS > 120_000) {
  fail('Film-Wartezeit muss knapp unter 120 s liegen')
}

if (!isImageGenPath('/image')) fail('/image ist Bild')
if (!isImageGenPath('/story-generate-character')) fail('Figur-Zeichnen ist Bild')
if (isImageGenPath('/film-from-prompt')) fail('Film-Prompt ist kein Bild')
if (isImageGenPath('/film-storyboard')) fail('Storyboard-Plan ist kein Bild')

const imgAbort = clientTimeoutMessage('/image', 'abort')
if (!imgAbort.includes('Bild')) fail('Bild-Timeout muss Bild erwähnen')

const filmAbort = clientTimeoutMessage('/film-from-prompt', 'abort')
if (filmAbort.includes('Bild')) fail('Film-Timeout darf nicht so tun, als wäre es ein Bild')
if (!filmAbort.includes('noch einmal')) fail('Film-Timeout: bitte noch einmal versuchen')

const filmServer = clientTimeoutMessage('/film-storyboard', 'server')
if (filmServer.includes('Bild')) fail('Server-Film-Timeout ohne Bild-Text')

if (resolvedFilmTitle('Park', 'langer prompt') !== 'Park') fail('gesetzter Titel bleibt')
if (resolvedFilmTitle('  ', 'Julien im Park\nTara kommt') !== 'Julien im Park') {
  fail('leerer Titel → erste Prompt-Zeile')
}
if (resolvedFilmTitle('', '   \n  ') !== EMPTY_FILM_TITLE) fail('gar nichts → Ohne Titel')
if (displayFilmTitle('') !== EMPTY_FILM_TITLE) fail('Anzeige leer → Ohne Titel')
if (displayFilmTitle('Mein Film') !== 'Mein Film') fail('Anzeige mit Titel')

const draft = placeholderDraftSection('s1', 'l1')
if (!draft.lines.length) fail('Entwurf braucht mindestens eine Zeile')
if (draft.title !== 'Entwurf') fail('Platzhalter-Abschnitt heisst Entwurf')

console.log('OK film-autosave')
