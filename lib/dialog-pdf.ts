import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Dialog } from '../shared/types.js'

export async function buildDialogPdf(dialog: Pick<Dialog, 'title' | 'sections'>): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page = pdf.addPage([595, 842])
  const margin = 50
  let y = page.getHeight() - margin
  const lineHeight = 16
  const maxWidth = page.getWidth() - margin * 2

  const wrap = (text: string, size: number, useBold = false): string[] => {
    const f = useBold ? fontBold : font
    const words = text.split(/\s+/)
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (f.widthOfTextAtSize(test, size) > maxWidth) {
        if (line) lines.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
    return lines
  }

  const drawLine = (text: string, size: number, useBold = false) => {
    for (const part of wrap(text, size, useBold)) {
      if (y < margin + lineHeight) {
        page = pdf.addPage([595, 842])
        y = page.getHeight() - margin
      }
      page.drawText(part, {
        x: margin,
        y,
        size,
        font: useBold ? fontBold : font,
        color: rgb(0.1, 0.1, 0.1),
      })
      y -= lineHeight
    }
  }

  drawLine(dialog.title, 18, true)
  y -= 8

  for (const section of dialog.sections) {
    if (section.title) {
      y -= 6
      drawLine(section.title, 13, true)
    }
    for (const line of section.lines) {
      drawLine(`${line.speaker}: ${line.text}`, 11)
    }
    y -= 4
  }

  return Buffer.from(await pdf.save())
}
