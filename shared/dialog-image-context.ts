import type { ChatMessage, Dialog } from './types.js'

export function formatCreationPromptForDisplay(dialog: Dialog): string | null {
  if (dialog.creationChat?.length) {
    return dialog.creationChat
      .map((m) => `${m.role === 'user' ? 'Du' : 'KI'}: ${m.content}`)
      .join('\n')
  }
  return dialog.creationPrompt?.trim() || null
}

export function imagePlanningContext(dialog: Dialog): string {
  const parts: string[] = []
  const creation = formatCreationPromptForDisplay(dialog)
  if (creation) {
    parts.push(`DIALOG-AUFTRAG (wie der Dialog entstanden ist):\n${creation}`)
  }
  if (dialog.imageDirection?.trim()) {
    parts.push(
      `BILD-HINWEISE VOM AUTOR (unbedingt berücksichtigen – Szenen, Stimmung, Lachen, Weinen, Setting):\n${dialog.imageDirection.trim()}`,
    )
  }
  return parts.join('\n\n')
}

export function buildCreationPromptFromChat(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role === 'user' ? 'Nutzer' : 'KI'}: ${m.content}`).join('\n')
}
