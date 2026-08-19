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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    layerId: string
    lastX: number
    lastY: number
    mode: 'move' | 'rotate'
    rotateAnchorX?: number
    rotateAnchorY?: number
    lastAngleDeg?: number
  } | null>(null)
  const [images, setImages] = useState<Map<string, CanvasImageSource>>(new Map())
  const animRef = useRef<AnimState>({
    offsets: new Map(),
    blinkTimers: new Map(),
  })
  const frameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

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
        const amplitude = anim.amplitude ?? 4
        const period = anim.period ?? 2000
        offset.dy = amplitude * Math.sin((timestamp / period) * Math.PI * 2)
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

      if (layer.flip) {
        ctx.translate(finalX + layer.width, finalY)
        ctx.scale(-1, 1)
        drawLayerImage(ctx, img, layer, 0, 0)
      } else {
        drawLayerImage(ctx, img, layer, finalX, finalY)
      }

      ctx.restore()
    }

    frameRef.current = requestAnimationFrame(render)
  }, [layers, images, animations, width, height])

  // Animation loop
  useEffect(() => {
    frameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frameRef.current)
  }, [render])

  const hitTest = useCallback(
    (canvasX: number, canvasY: number): LayerImage | null => {
      const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex)
      for (const layer of sorted) {
        if (!layer.draggable) continue
        if (
          canvasX >= layer.x &&
          canvasX <= layer.x + layer.width &&
          canvasY >= layer.y &&
          canvasY <= layer.y + layer.height
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

  const layerAnchor = (layer: LayerImage) => {
    const finalX = layer.x
    const finalY = layer.y
    return {
      x: finalX + layer.width * (layer.rotationAnchor?.x ?? 0.5),
      y: finalY + layer.height * (layer.rotationAnchor?.y ?? 1),
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !onWheelLayer) return

    const onWheel = (e: WheelEvent) => {
      const { x, y } = toCanvasCoords(e)
      const hit =
        hitTest(x, y) ??
        (selectedLayerId ? layers.find((l) => l.id === selectedLayerId && l.draggable) ?? null : null)
      if (!hit) return
      e.preventDefault()
      const delta = -e.deltaY * 0.002
      onWheelLayer(hit.id, delta)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [layers, selectedLayerId, onWheelLayer, hitTest, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`${className ?? ''}${selectedLayerId ? ' story-canvas-interactive' : ''}`}
      style={{ display: 'block', maxWidth: '100%', height: 'auto', touchAction: 'none' }}
      onPointerDown={(e) => {
        const { x, y } = toCanvasCoords(e)
        const hit = hitTest(x, y)
        if (hit) {
          if (e.shiftKey && onRotateLayer) {
            const anchor = layerAnchor(hit)
            const angleDeg = (Math.atan2(y - anchor.y, x - anchor.x) * 180) / Math.PI
            dragRef.current = {
              layerId: hit.id,
              lastX: x,
              lastY: y,
              mode: 'rotate',
              rotateAnchorX: anchor.x,
              rotateAnchorY: anchor.y,
              lastAngleDeg: angleDeg,
            }
          } else {
            dragRef.current = { layerId: hit.id, lastX: x, lastY: y, mode: 'move' }
          }
          onSelectLayer?.(hit.id)
          canvasRef.current?.setPointerCapture(e.pointerId)
        } else {
          onSelectLayer?.(null)
        }
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current
        if (!drag) return
        const { x, y } = toCanvasCoords(e)
        if (drag.mode === 'rotate' && onRotateLayer && drag.rotateAnchorX != null && drag.lastAngleDeg != null) {
          const angleDeg = (Math.atan2(y - drag.rotateAnchorY!, x - drag.rotateAnchorX!) * 180) / Math.PI
          let delta = angleDeg - drag.lastAngleDeg
          if (delta > 180) delta -= 360
          if (delta < -180) delta += 360
          if (Math.abs(delta) > 0.2) {
            onRotateLayer(drag.layerId, delta)
            drag.lastAngleDeg = angleDeg
          }
          return
        }
        if (!onDragLayer) return
        const dx = x - drag.lastX
        const dy = y - drag.lastY
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
