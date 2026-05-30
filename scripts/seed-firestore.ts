import 'dotenv/config'
import { seedStudentCodes } from '../lib/firestore.js'

const DEMO_CODES = ['SCHUELER2024', 'KLASSE7A', 'DEMO123']

async function main() {
  console.log('Seede Schülercodes in Firestore …')
  await seedStudentCodes(DEMO_CODES)
  console.log('Fertig:', DEMO_CODES.join(', '))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
