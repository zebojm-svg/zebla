/**
 * Figuren werden serverseitig per Personen-Maske freigestellt (nicht per Kleidungsfarbe).
 * Hier nur durchreichen — kein zweites Farb-Keying, das Schuhe und rote Shirts zerstört.
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
