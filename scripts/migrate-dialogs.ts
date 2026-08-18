import 'dotenv/config'
import { adminAuth, adminDb } from '../lib/firebase-admin.js'

/**
 * Überträgt Dialoge (und persönliche Ordner) von einem Konto auf ein anderes.
 *
 *   npm run migrate:dialogs -- --list
 *   npm run migrate:dialogs -- --from DEMO123 --to zebojm@gmail.com
 *   npm run migrate:dialogs -- --from DEMO123 --to zebojm@gmail.com --apply
 *
 * Ohne --apply wird nichts geschrieben (Dry-Run).
 */

type Args = {
  list: boolean
  from?: string
  to?: string
  apply: boolean
  includeClass: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, apply: false, includeClass: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--list') args.list = true
    else if (arg === '--apply') args.apply = true
    else if (arg === '--include-class') args.includeClass = true
    else if (arg === '--from') args.from = argv[++i]
    else if (arg === '--to') args.to = argv[++i]
  }
  return args
}

async function countByUser(collection: string, userId: string): Promise<number> {
  const snap = await adminDb().collection(collection).where('userId', '==', userId).get()
  return snap.size
}

async function listAccounts() {
  const snap = await adminDb().collection('users').get()
  const rows: Array<{
    uid: string
    name: string
    email: string
    authType: string
    role: string
    dialogs: number
    folders: number
  }> = []

  for (const doc of snap.docs) {
    const data = doc.data()
    rows.push({
      uid: doc.id,
      name: (data.name as string) ?? '—',
      email: (data.email as string) ?? '—',
      authType: (data.authType as string) ?? '—',
      role: (data.role as string) ?? '—',
      dialogs: await countByUser('dialogs', doc.id),
      folders: await countByUser('folders', doc.id),
    })
  }

  rows.sort((a, b) => b.dialogs - a.dialogs)

  console.log(`\n${rows.length} Konten in Firestore:\n`)
  for (const r of rows) {
    console.log(
      `  ${r.role.padEnd(7)} ${r.authType.padEnd(7)} dialoge=${String(r.dialogs).padStart(3)} ordner=${String(
        r.folders,
      ).padStart(3)}  ${r.name} <${r.email}>  uid=${r.uid}`,
    )
  }

  const codes = await adminDb().collection('studentCodes').get()
  console.log(`\n${codes.size} Schülercodes:\n`)
  for (const doc of codes.docs) {
    const userId = (doc.data().userId as string | undefined) ?? '(noch nie benutzt)'
    console.log(`  ${doc.id.padEnd(14)} → uid=${userId}`)
  }
  console.log()
}

async function resolveSourceUid(input: string): Promise<string> {
  const codeSnap = await adminDb()
    .collection('studentCodes')
    .doc(input.toUpperCase().trim())
    .get()
  if (codeSnap.exists) {
    const uid = codeSnap.data()?.userId as string | undefined
    if (!uid) throw new Error(`Schülercode ${input} wurde noch nie benutzt — keine Dialoge.`)
    return uid
  }
  return input
}

async function resolveTargetUid(input: string): Promise<string> {
  if (!input.includes('@')) return input
  const user = await adminAuth().getUserByEmail(input.trim().toLowerCase())
  return user.uid
}

async function migrate(args: Args) {
  const sourceUid = await resolveSourceUid(args.from!)
  const targetUid = await resolveTargetUid(args.to!)

  if (sourceUid === targetUid) throw new Error('Quelle und Ziel sind dasselbe Konto.')

  const [sourceProfile, targetProfile] = await Promise.all([
    adminDb().collection('users').doc(sourceUid).get(),
    adminDb().collection('users').doc(targetUid).get(),
  ])

  if (!targetProfile.exists) {
    throw new Error(
      `Zielkonto ${targetUid} hat noch kein Profil in Firestore. Bitte zuerst einmal in Zebla anmelden.`,
    )
  }

  console.log(
    `\nVon: ${sourceProfile.data()?.name ?? '?'} (${sourceProfile.data()?.authType ?? '?'}) uid=${sourceUid}`,
  )
  console.log(
    `Nach: ${targetProfile.data()?.name ?? '?'} (${targetProfile.data()?.role ?? '?'}) uid=${targetUid}\n`,
  )

  const dialogsSnap = await adminDb().collection('dialogs').where('userId', '==', sourceUid).get()
  const foldersSnap = await adminDb().collection('folders').where('userId', '==', sourceUid).get()

  const personalFolders = foldersSnap.docs.filter((d) => (d.data().scope ?? 'personal') !== 'class')
  const movableDialogs = dialogsSnap.docs.filter(
    (d) => args.includeClass || !d.data().classId,
  )
  const skippedDialogs = dialogsSnap.docs.filter((d) => !args.includeClass && d.data().classId)

  console.log('Dialoge:')
  for (const doc of movableDialogs) {
    const data = doc.data()
    console.log(
      `  → ${data.title ?? '(ohne Titel)'} [${data.sourceLanguage}→${data.targetLanguage}] ${doc.id}`,
    )
  }
  if (!movableDialogs.length) console.log('  (keine)')

  if (skippedDialogs.length) {
    console.log(`\nÜbersprungen (Klassendialoge, mit --include-class mitnehmen):`)
    for (const doc of skippedDialogs) {
      console.log(`  · ${doc.data().title ?? '(ohne Titel)'} ${doc.id}`)
    }
  }

  console.log(`\nPersönliche Ordner: ${personalFolders.length}`)
  for (const doc of personalFolders) {
    console.log(`  → ${doc.data().name} ${doc.id}`)
  }

  if (!args.apply) {
    console.log('\nDry-Run — nichts geschrieben. Mit --apply ausführen.\n')
    return
  }

  const now = new Date().toISOString()
  const batch = adminDb().batch()

  for (const doc of personalFolders) {
    batch.update(doc.ref, { userId: targetUid, updatedAt: now })
  }

  for (const doc of movableDialogs) {
    const isClassDialog = Boolean(doc.data().classId)
    batch.update(doc.ref, {
      userId: targetUid,
      updatedAt: now,
      // Klassendialoge verlieren ihre Klassenbindung, damit sie in der eigenen Bibliothek landen.
      ...(isClassDialog ? { classId: null, folderId: null } : {}),
    })
  }

  await batch.commit()
  console.log(
    `\nFertig: ${movableDialogs.length} Dialoge und ${personalFolders.length} Ordner übertragen.\n`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.list || !args.from || !args.to) {
    await listAccounts()
    if (!args.list) {
      console.log('Nutzung: --from <SCHUELERCODE|uid> --to <email|uid> [--apply] [--include-class]\n')
    }
    return
  }

  await migrate(args)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
