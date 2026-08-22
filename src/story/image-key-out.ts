/**
 * Entfernt Magenta-Key und reines Weiß aus KI-Figuren (Freistellen).
 * Lücken zwischen Armen/Fingern werden mitgelöscht; helle Schuhe, Augen und Zähne bleiben.
 */

import { keyOutConnectedBackground } from '../../shared/image-key-out-edges'

export function keyOutLightBackground(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.drawImage(source, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  keyOutConnectedBackground(imageData.data, width, height)
  ctx.putImageData(imageData, 0, 0)
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
