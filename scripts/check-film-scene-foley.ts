/**
 * Szenen-Geräusche aus der Ton-Notiz.
 * Aufruf: npx tsx scripts/check-film-scene-foley.ts
 */
import { foleyFlagsFromNote } from '../shared/film-scene-foley.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

const nuts = foleyFlagsFromNote(
  'Leises Knistern von Nüssen, gedämpfte Stadtgeräusche, sanfte persische Instrumentalmusik.',
)
if (!nuts.crackle) fail('Nuss-Knistern aus der Notiz')
if (!nuts.city) fail('Stadtgeräusch aus der Notiz')

const quiet = foleyFlagsFromNote('nur Stimmen')
if (quiet.crackle || quiet.city) fail('Ohne Hinweis keine Extra-Geräusche')

console.log('OK: Szenen-Geräusche aus der Ton-Notiz')
