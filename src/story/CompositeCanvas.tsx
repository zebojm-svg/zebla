import { useEffect, useRef, useState } from 'react'

export interface LayerImage {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  flip?: boolean
  opacity?: number
  zIndex: number
}

type Props = {
  width: number
  height: number
  layers: LayerImage[]
  className?: string
}

export function CompositeCanvas({ width, height, layers, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    const toLoad = layers.filter((l) => !images.has(l.src))
    if (toLoad.length === 0) return

    let cancelled = false
    Promise.all(
      toLoad.map(
        (l) =>
          new Promise<[string, HTMLImageElement]>((resolve) => {
            const img = new Image()
            img.onload = () => resolve([l.src, img])
            img.onerror = () => resolve([l.src, img])
            img.src = l.src
          }),
      ),
    ).then((loaded) => {
      if (cancelled) return
      setImages((prev) => {
        const next = new Map(prev)
        for (const [src, img] of loaded) next.set(src, img)
        return next
      })
    })
    return () => { cancelled = true }
  }, [layers])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex)

    for (const layer of sorted) {
      const img = images.get(layer.src)
      if (!img || !img.complete || img.naturalWidth === 0) continue

      ctx.save()
      ctx.globalAlpha = layer.opacity ?? 1

      if (layer.flip) {
        ctx.translate(layer.x + layer.width, layer.y)
        ctx.scale(-1, 1)
        ctx.drawImage(img, 0, 0, layer.width, layer.height)
      } else {
        ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height)
      }

      ctx.restore()
    }
  }, [layers, images, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    />
  )
}
