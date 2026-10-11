/**
 * Vercel-Git-Vorschau vs. Live-Domain.
 * Aufruf: npx tsx scripts/check-deploy-host.ts
 */
import { isVercelGitPreviewHost, ZEBLA_LIVE_URL } from '../shared/deploy-host.ts'

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

if (
  !isVercelGitPreviewHost(
    'zebla-git-cursor-closeup-pushin-6add-zebojm-svgs-projects.vercel.app',
  )
) {
  fail('Git-Vorschau muss erkannt werden')
}
if (isVercelGitPreviewHost('zebla.zebotools.ch')) fail('Live-Domain ist keine Vorschau')
if (isVercelGitPreviewHost('localhost')) fail('localhost ist keine Vorschau')
if (isVercelGitPreviewHost('zebla-zebojm-svgs-projects.vercel.app')) {
  fail('Production-Vercel ohne -git- nicht als Vorschau sperren')
}
if (!ZEBLA_LIVE_URL.includes('zebla.zebotools.ch')) fail('Live-URL')

console.log('OK: Vorschau-Host vs. Live-Domain')
