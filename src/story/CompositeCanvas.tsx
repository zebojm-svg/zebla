import { useEffect, useRef, useState, useCallback } from 'react'

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
}

interface AnimState {
  offsets: Map<string, { dx: number; dy: number; rotation: number; opacity: number }>
  blinkTimers: Map<string, { nextBlink: number; isBlinking: boolean; blinkEnd: number }>
}

export function CompositeCanvas({ width, height, layers, animations = [], className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map())
  const animRef = useRef<AnimState>({
    offsets: new Map(),
    blinkTimers: new Map(),
  })
  const frameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  // Load images
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
      const img = images.get(layer.src)
      if (!img || !img.complete || img.naturalWidth === 0) continue

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
        ctx.drawImage(img, 0, 0, layer.width, layer.height)
      } else {
        ctx.drawImage(img, finalX, finalY, layer.width, layer.height)
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
