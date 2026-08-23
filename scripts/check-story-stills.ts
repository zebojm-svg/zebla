/**
 * Prompt- und Engine-Checks für die Standbild-Pipeline.
 * Aufruf: npx tsx scripts/check-story-stills.ts
 */
import {
  STILL_POSES,
  buildKontextEditPrompt,
  buildModularStillPrompt,
  isStillPoseId,
  stillsEngineFromEnv,
  stillsPromptParts,
} from '../shared/story-stills.ts'
import { stillsEngineFromEnv as stillsEngineFromLib } from '../lib/story-stills-gen.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (STILL_POSES.length < 6) fail('Zu wenige Standbild-Posen')
if (!isStillPoseId('standing-front')) fail('standing-front muss eine Pose sein')
if (isStillPoseId('banana')) fail('Ungültige Pose darf nicht durchgehen')

const parts = stillsPromptParts({
  poseId: 'waving',
  styleId: 'illustration-lebendig',
  appearance: 'This is JULIEN in a green hoodie',
})
if (!parts.lock.toLowerCase().includes('exact person')) fail('Lock-Teil fehlt')
if (!parts.pose.toLowerCase().includes('waving')) fail('Pose-Teil fehlt')
if (!parts.bg.toLowerCase().includes('transparent')) fail('Hintergrund-Teil fehlt')
if (!parts.style.toLowerCase().includes('graphic novel')) fail('Stil-Suffix fehlt')

const modular = buildModularStillPrompt({ poseId: 'sitting', appearance: 'Julien' })
for (const tag of ['[lock]', '[pose]', '[bg]', '[style]']) {
  if (!modular.includes(tag)) fail(`Modularer Prompt ohne ${tag}`)
}

const kontext = buildKontextEditPrompt({
  poseId: 'look-left',
  appearance: 'Julien green hoodie',
})
if (!kontext.toLowerCase().includes('change only the pose')) {
  fail('Kontext-Prompt muss eine Edit-Anweisung sein, kein reines Text-zu-Bild')
}
if (kontext.toLowerCase().includes('invent a new character from scratch')) {
  fail('Kontext darf keine neue Figur aus Text erfinden')
}

const none = stillsEngineFromEnv({})
if (none.lockEngine !== 'gemini-i2i') fail('Ohne Keys: Gemini mit Foto als Lock-Notnagel')
if (none.masterEngine !== 'gemini-t2i') fail('Stamm-Bild darf einmal ohne Foto starten')

const replicate = stillsEngineFromEnv({ REPLICATE_API_TOKEN: 'r8_test' })
if (replicate.lockEngine !== 'flux-kontext-replicate') fail('Replicate-Key muss FLUX Kontext wählen')

const fal = stillsEngineFromEnv({ FAL_KEY: 'fal-test' })
if (fal.lockEngine !== 'flux-kontext-fal') fail('Fal-Key muss FLUX Kontext wählen')

const both = stillsEngineFromEnv({
  REPLICATE_API_TOKEN: 'r8_test',
  FAL_KEY: 'fal-test',
})
if (both.lockEngine !== 'flux-kontext-replicate') fail('Replicate hat Vorrang vor Fal')

const fromLib = stillsEngineFromLib({ GEMINI_API_KEY: 'x' })
if (fromLib.lockEngine !== 'gemini-i2i') fail('lib/story-stills-gen muss dieselbe Engine-Wahl nutzen')

console.log('OK: Standbilder sperren die Figur, FLUX Kontext zuerst, kein Text-zu-Bild für Posen')
