/**
 * Entfernt helle/weiße Hintergründe aus KI-Figuren (Freistellen).
 * Gleiche Logik wie lib/story-image-processing.ts — für Canvas im Browser.
 */

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
  const d = imageData.data

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!
    const g = d[i + 1]!
    const b = d[i + 2]!
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max === 0 ? 0 : (max - min) / max

    if (r > 235 && g > 235 && b > 235) {
      d[i + 3] = 0
    } else if (r > 205 && g > 205 && b > 205 && saturation < 0.18) {
      const lum = (r + g + b) / 3
      d[i + 3] = Math.min(d[i + 3]!, Math.round(Math.max(0, ((255 - lum) / 50) * d[i + 3]!)))
    }
  }

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
