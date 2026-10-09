/**
 * Geschichte = Ordner, Welt-Regal, Meta-Blatt (ohne Firebase).
 * Aufruf: npx tsx scripts/check-story-project.ts
 */
import { EMPTY_FILM_TITLE } from '../shared/film-draft.ts'
import {
  isLibraryShelf,
  isStoryFolder,
  LIBRARY_SHELVES,
  normalizeStoryMeta,
  storyProjectName,
} from '../shared/story-project.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (isStoryFolder({ kind: 'story' }) !== true) fail('story-Ordner erkennen')
if (isStoryFolder({ kind: 'folder' }) !== false) fail('normaler Ordner ist keine Geschichte')
if (isStoryFolder(null) !== false) fail('fehlender Ordner ist keine Geschichte')

if (storyProjectName('') !== 'Neue Geschichte') fail('leerer Titel → Neue Geschichte')
if (storyProjectName(EMPTY_FILM_TITLE) !== 'Neue Geschichte') fail('Ohne Titel → Neue Geschichte')
if (storyProjectName('  Julien im Park  ') !== 'Julien im Park') fail('Titel wird getrimmt')
if (storyProjectName('x'.repeat(120)).length !== 80) fail('Ordnername max. 80 Zeichen')

const meta = normalizeStoryMeta({
  castNote: '  Julien, Tara  ',
  roomsNote: undefined,
  voicesNote: ' ',
})
if (meta.castNote !== 'Julien, Tara') fail('Cast-Notiz trimmen')
if (meta.roomsNote !== '') fail('fehlende Raum-Notiz → leer')
if (meta.voicesNote !== '') fail('leere Stimmen-Notiz → leer')
if (meta.lookNote !== '') fail('fehlender Blick → leer')

if (LIBRARY_SHELVES.map((s) => s.id).join(',') !== 'character,environment,prop,sketch') {
  fail('Welt-Regal: Figuren, Räume, Möbel, Skizzen')
}
if (!isLibraryShelf('prop')) fail('Möbel-Regal gilt')
if (isLibraryShelf('dialog')) fail('Dialog ist kein Regal')

console.log('OK story-project')
