/** Copy text; fall back to prompt so share still succeeds without clipboard permission. */
export async function copyTextToClipboard(text: string): Promise<'copied' | 'prompted'> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    /* fall through */
  }
  window.prompt('Link zum Kopieren:', text)
  return 'prompted'
}
