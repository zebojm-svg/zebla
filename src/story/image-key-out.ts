/**
 * Figuren werden serverseitig per Personen-Maske freigestellt.
 * Zusätzlich lochen wir Studio-Grau in Achseln — auch bei älteren Bildern,
 * die noch gefüllte Lücken haben. Schlägt CORS fehl, bleibt das Bild unverändert.
 */

import { punchStudioBackdrop } from '../../shared/image-person-matte'

export function keyOutLightBackground(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas
  ctx.drawImage(source, 0, 0, width, height)
  try {
    const imageData = ctx.getImageData(0, 0, width, height)
    punchStudioBackdrop(imageData.data, width, height)
    ctx.putImageData(imageData, 0, 0)
  } catch {
    /* GCS ohne CORS: getImageData wirft, Figur bleibt wie geliefert */
  }
  return canvas
}

export function loadKeyedImage(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      resolve(keyOutLightBackground(img, img.naturalWidth, img.naturalHeight))
    }
    img.onerror = () => reject(new Error(`Bild konnte nicht geladen werden: ${src}`))
    img.src = src
  })
}
