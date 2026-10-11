/** Live-Seite, auf der Google-Anmeldung erlaubt ist. */
export const ZEBLA_LIVE_URL = 'https://zebla.zebotools.ch'

/**
 * Vercel-Git-Vorschau (…-git-….vercel.app) — nicht in Firebase eingetragen.
 * Live bleibt zebla.zebotools.ch bzw. die Production-Domain ohne -git-.
 */
export function isVercelGitPreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  return host.endsWith('.vercel.app') && host.includes('-git-')
}
