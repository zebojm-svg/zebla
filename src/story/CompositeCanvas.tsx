import { useEffect, useRef, useState, useCallback } from 'react'
import { keyOutLightBackground } from './image-key-out'

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
  /** Rotation in degrees around anchor */
  rotation?: number
  /** Anchor for rotation (0-1 normalized within layer) */
  rotationAnchor?: { x: number; y: number }
  /** CSS filter hue-rotate in degrees (Einzelteile einfärben) */
  hueRotate?: number
  /** Weißen/hellen KI-Hintergrund beim Zeichnen entfernen */
  keyOutWhite?: boolean
  /** Quellbild-Ausschnitt (0–1), z.B. Beine bei Sitz-Pose abschneiden */
  sourceCrop?: { top?: number; bottom?: number; left?: number; right?: number }
  /** Auf der Leinwand verschiebbar */
  draggable?: boolean
  /** Zusätzliche Drehung um ein Gelenk (Kopf am Hals), nach der Layer-Drehung */
  localRotation?: number
  localRotationAnchor?: { x: number; y: number }
}

export interface LayerAnimation {
  layerId: string
  type: 'drift' | 'swing' | 'blink' | 'bob'
  /** Pixels per second for drift */
  speed?: number
  /** Max angle for swing (degrees) */
  amplitude?: number
  /** Duration of one cycle in ms */
  period?: number
  /** For blink: how long eyes stay closed (ms) */
  blinkDuration?: number
  /** For blink: interval range [min, max] ms between blinks */
  blinkInterval?: [number, number]
  /** Direction for drift */
  direction?: { x: number; y: number }
  /** Wrap around when drifting off-screen */
  wrap?: boolean
  wrapMargin?: number
}

type Props = {
  width: number
  height: number
  layers: LayerImage[]
  animations?: LayerAnimation[]
  className?: string
  selectedLayerId?: string | null
  onSelectLayer?: (layerId: string | null) => void
  onDragLayer?: (layerId: string, dx: number, dy: number) => void
  onWheelLayer?: (layerId: string, deltaScale: number) => void
  onRotateLayer?: (layerId: string, deltaRotation: number) => void
  /** Shift+Ziehen: Breite (dx) und Höhe (dy) zerren */
  onStretchLayer?: (layerId: string, dScaleX: number, dScaleY: number) => void
}

interface AnimState {
  offsets: Map<string, { dx: number; dy: number; rotation: number; opacity: number }>
  blinkTimers: Map<string, { nextBlink: number; isBlinking: boolean; blinkEnd: number }>
}

function imageSourceSize(img: CanvasImageSource): { w: number; h: number } {
  if (img instanceof HTMLImageElement) {
    return { w: img.naturalWidth, h: img.naturalHeight }
  }
  if (img instanceof HTMLCanvasElement) {
    return { w: img.width, h: img.height }
  }
  return { w: 0, h: 0 }
}

function drawLayerImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  layer: LayerImage,
  destX: number,
  destY: number,
) {
  const { w: srcW, h: srcH } = imageSourceSize(img)
  if (srcW === 0 || srcH === 0) return

  const crop = layer.sourceCrop
  const sx = Math.round((crop?.left ?? 0) * srcW)
  const sy = Math.round((crop?.top ?? 0) * srcH)
  const sw = Math.max(
    1,
    Math.round(srcW - sx - (crop?.right ?? 0) * srcW),
  )
  const sh = Math.max(
    1,
    Math.round(srcH - sy - (crop?.bottom ?? 0) * srcH),
  )

  ctx.drawImage(img, sx, sy, sw, sh, destX, destY, layer.width, layer.height)
}

export function CompositeCanvas({
  width,
  height,
  layers,
  animations = [],
  className,
  selectedLayerId,
  onSelectLayer,
  onDragLayer,
  onWheelLayer,
  onRotateLayer,
  onStretchLayer,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    layerId: string
    lastX: number
    lastY: number
    mode: 'move' | 'rotate' | 'stretch'
  } | null>(null)
  const [images, setImages] = useState<Map<string, CanvasImageSource>>(new Map())
  const animRef = useRef<AnimState>({
    offsets: new Map(),
    blinkTimers: new Map(),
  })
  const lastTimeRef = useRef<number>(0)
  const renderRef = useRef<(timestamp: number) => void>(() => {})

  // Load images
  useEffect(() => {
    const toLoad = layers.filter((l) => {
      const cacheKey = l.keyOutWhite ? `key:${l.src}` : l.src
      return !images.has(cacheKey)
    })
    if (toLoad.length === 0) return

    let cancelled = false
    Promise.all(
      toLoad.map(
        (l) =>
          new Promise<[string, CanvasImageSource]>((resolve) => {
            const cacheKey = l.keyOutWhite ? `key:${l.src}` : l.src
            const img = new Image()
            if (l.keyOutWhite) {
              img.crossOrigin = 'anonymous'
            }
            img.onload = () => {
              if (l.keyOutWhite && img.naturalWidth > 0) {
                try {
                  resolve([
                    cacheKey,
                    keyOutLightBackground(img, img.naturalWidth, img.naturalHeight),
                  ])
                } catch {
                  resolve([cacheKey, img])
                }
              } else {
                resolve([cacheKey, img])
              }
            }
            img.onerror = () => {
              if (l.keyOutWhite) {
                const fallback = new Image()
                fallback.onload = () => resolve([cacheKey, fallback])
                fallback.onerror = () => resolve([cacheKey, img])
                fallback.src = l.src
                return
              }
              resolve([cacheKey, img])
            }
            img.src = l.src
          }),
      ),
    ).then((loaded) => {
      if (cancelled) return
      setImages((prev) => {
        const next = new Map(prev)
        for (const [key, img] of loaded) next.set(key, img)
        return next
      })
    })
    return () => { cancelled = true }
  }, [layers])

  // Init blink timers
  useEffect(() => {
    const state = animRef.current
    for (const anim of animations) {
      if (anim.type === 'blink' && !state.blinkTimers.has(anim.layerId)) {
        const interval = anim.blinkInterval ?? [2500, 5000]
        state.blinkTimers.set(anim.layerId, {
          nextBlink: performance.now() + interval[0] + Math.random() * (interval[1] - interval[0]),
          isBlinking: false,
          blinkEnd: 0,
        })
      }
    }
  }, [animations])

  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016
    lastTimeRef.current = timestamp

    const state = animRef.current

    // Update animations
    for (const anim of animations) {
      let offset = state.offsets.get(anim.layerId)
      if (!offset) {
        offset = { dx: 0, dy: 0, rotation: 0, opacity: 1 }
        state.offsets.set(anim.layerId, offset)
      }

      if (anim.type === 'drift') {
        const speed = anim.speed ?? 20
        const dir = anim.direction ?? { x: 1, y: 0 }
        offset.dx += dir.x * speed * dt
        offset.dy += dir.y * speed * dt

        if (anim.wrap) {
          const margin = anim.wrapMargin ?? 200
          if (offset.dx > width + margin) offset.dx = -margin
          if (offset.dx < -margin - width) offset.dx = width + margin
        }
      }

      if (anim.type === 'swing') {
        const amplitude = anim.amplitude ?? 3
        const period = anim.period ?? 3000
        offset.rotation = amplitude * Math.sin((timestamp / period) * Math.PI * 2)
      }

      if (anim.type === 'bob') {
        if (selectedLayerId && anim.layerId === selectedLayerId) {
          offset.dy = 0
        } else {
          const amplitude = anim.amplitude ?? 4
          const period = anim.period ?? 2000
          offset.dy = amplitude * Math.sin((timestamp / period) * Math.PI * 2)
        }
      }

      if (anim.type === 'blink') {
        const timer = state.blinkTimers.get(anim.layerId)
        if (timer) {
          if (!timer.isBlinking && timestamp >= timer.nextBlink) {
            timer.isBlinking = true
            timer.blinkEnd = timestamp + (anim.blinkDuration ?? 150)
          }
          if (timer.isBlinking && timestamp >= timer.blinkEnd) {
            timer.isBlinking = false
            const interval = anim.blinkInterval ?? [2500, 5000]
            timer.nextBlink = timestamp + interval[0] + Math.random() * (interval[1] - interval[0])
          }
          offset.opacity = timer.isBlinking ? 0.05 : 1
        }
      }
    }

    // Clear and draw
    ctx.clearRect(0, 0, width, height)
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex)

    for (const layer of sorted) {
      const cacheKey = layer.keyOutWhite ? `key:${layer.src}` : layer.src
      const img = images.get(cacheKey)
      if (!img) continue
      if (img instanceof HTMLImageElement && (!img.complete || img.naturalWidth === 0)) continue

      const offset = state.offsets.get(layer.id)
      const dx = offset?.dx ?? 0
      const dy = offset?.dy ?? 0
      const animRotation = offset?.rotation ?? 0
      const animOpacity = offset?.opacity ?? 1

      const finalX = layer.x + dx
      const finalY = layer.y + dy
      const totalRotation = (layer.rotation ?? 0) + animRotation
      const localRotation = layer.localRotation ?? 0

      ctx.save()
      ctx.globalAlpha = (layer.opacity ?? 1) * animOpacity
      if (layer.hueRotate) {
        ctx.filter = `hue-rotate(${layer.hueRotate}deg)`
      }

      const anchorX = finalX + layer.width * (layer.rotationAnchor?.x ?? 0.5)
      const anchorY = finalY + layer.height * (layer.rotationAnchor?.y ?? 1)

      if (totalRotation !== 0) {
        ctx.translate(anchorX, anchorY)
        ctx.rotate((totalRotation * Math.PI) / 180)
        ctx.translate(-anchorX, -anchorY)
      }

      if (localRotation !== 0) {
        const lx = finalX + layer.width * (layer.localRotationAnchor?.x ?? 0.5)
        const ly = finalY + layer.height * (layer.localRotationAnchor?.y ?? 0.22)
        ctx.translate(lx, ly)
        ctx.rotate((localRotation * Math.PI) / 180)
        ctx.translate(-lx, -ly)
      }

      if (layer.flip) {
        ctx.translate(finalX + layer.width, finalY)
        ctx.scale(-1, 1)
        drawLayerImage(ctx, img, layer, 0, 0)
      } else {
        drawLayerImage(ctx, img, layer, finalX, finalY)
      }

      ctx.restore()
    }

    if (selectedLayerId) {
      const selectedLayers = layers.filter(
        (l) => l.id === selectedLayerId || l.id.startsWith(`${selectedLayerId}-`),
      )
      if (selectedLayers.length > 0) {
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const selected of selectedLayers) {
          const offset = state.offsets.get(selected.id)
          const sx = selected.x + (offset?.dx ?? 0)
          const sy = selected.y + (offset?.dy ?? 0)
          minX = Math.min(minX, sx)
          minY = Math.min(minY, sy)
          maxX = Math.max(maxX, sx + selected.width)
          maxY = Math.max(maxY, sy + selected.height)
        }
        ctx.save()
        ctx.strokeStyle = '#2dd4bf'
        ctx.lineWidth = 3
        ctx.setLineDash([10, 6])
        ctx.strokeRect(minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12)
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'
        const label = 'Ziehen · Rad · Shift · Strg'
        ctx.font = '600 16px system-ui, sans-serif'
        const padX = 10
        const boxW = Math.min(width - 16, ctx.measureText(label).width + padX * 2)
        const boxH = 26
        let boxX = minX - 6
        if (boxX + boxW > width - 8) boxX = width - 8 - boxW
        if (boxX < 8) boxX = 8
        let boxY = minY + 8
        if (boxY + boxH > height - 8) boxY = Math.max(8, minY - 8 - boxH)
        ctx.fillRect(boxX, boxY, boxW, boxH)
        ctx.fillStyle = '#ccfbf1'
        ctx.fillText(label, boxX + padX, boxY + 18)
        ctx.restore()
      }
    }
  }, [layers, images, animations, width, height, selectedLayerId])

  useEffect(() => {
    renderRef.current = render
  }, [render])

  // Animation loop
  useEffect(() => {
    let alive = true
    let id = 0
    const loop = (timestamp: number) => {
      if (!alive) return
      renderRef.current(timestamp)
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => {
      alive = false
      cancelAnimationFrame(id)
    }
  }, [])

  const hitTest = useCallback(
    (canvasX: number, canvasY: number): LayerImage | null => {
      const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex)
      for (const layer of sorted) {
        if (!layer.draggable) continue
        const pad = 12
        if (
          canvasX >= layer.x - pad &&
          canvasX <= layer.x + layer.width + pad &&
          canvasY >= layer.y - pad &&
          canvasY <= layer.y + layer.height + pad
        ) {
          return layer
        }
      }
      return null
    },
    [layers],
  )

  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement> | WheelEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = 'clientX' in e ? e.clientX : 0
    const clientY = 'clientY' in e ? e.clientY : 0
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !onWheelLayer) return

    const onWheel = (e: WheelEvent) => {
      if (!selectedLayerId) return
      const selected = layers.find(
        (l) =>
          l.draggable &&
          (l.id === selectedLayerId || l.id.startsWith(`${selectedLayerId}-`)),
      )
      if (!selected) return
      e.preventDefault()
      const delta = -e.deltaY * 0.002
      onWheelLayer(selected.id, delta)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [layers, selectedLayerId, onWheelLayer, width, height])

  const canvasClass = [
    className ?? '',
    selectedLayerId ? 'story-canvas-interactive' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={canvasClass}
      style={{ display: 'block', maxWidth: '100%', height: 'auto', touchAction: 'none' }}
      onPointerDown={(e) => {
        const { x, y } = toCanvasCoords(e)
        const hit = hitTest(x, y)
        if (hit) {
          const mode: 'move' | 'rotate' | 'stretch' = e.ctrlKey || e.metaKey
            ? 'rotate'
            : e.shiftKey
              ? 'stretch'
              : 'move'
          dragRef.current = { layerId: hit.id, lastX: x, lastY: y, mode }
          onSelectLayer?.(hit.id)
          canvasRef.current?.setPointerCapture(e.pointerId)
          return
        }
        if (selectedLayerId) {
          const selectedLayers = layers.filter(
            (l) => l.id === selectedLayerId || l.id.startsWith(`${selectedLayerId}-`),
          )
          const pad = 28
          const inside = selectedLayers.some(
            (l) =>
              x >= l.x - pad &&
              x <= l.x + l.width + pad &&
              y >= l.y - pad &&
              y <= l.y + l.height + pad,
          )
          if (inside) return
        }
        onSelectLayer?.(null)
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag) return
        const { x, y } = toCanvasCoords(e)
        const dx = x - drag.lastX
        const dy = y - drag.lastY
        if (drag.mode === 'rotate' && onRotateLayer) {
          if (Math.abs(dx) > 0.4) {
            onRotateLayer(drag.layerId, dx * 0.28)
            drag.lastX = x
            drag.lastY = y
          }
          return
        }
        if (drag.mode === 'stretch' && onStretchLayer) {
          if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
            onStretchLayer(drag.layerId, dx * 0.004, dy * 0.004)
            drag.lastX = x
            drag.lastY = y
          }
          return
        }
        if (!onDragLayer) return
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          onDragLayer(drag.layerId, dx, dy)
          drag.lastX = x
          drag.lastY = y
        }
      }}
      onPointerUp={(e) => {
        dragRef.current = null
        try {
          canvasRef.current?.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }}
    />
  )
}
