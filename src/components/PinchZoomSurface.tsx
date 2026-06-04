import { useEffect, useRef, type ReactNode } from 'react'

const MIN = 0.65
const MAX = 3

function touchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

interface PinchZoomSurfaceProps {
  className?: string
  children: ReactNode
}

/** Zwei-Finger-Zoom / Strg+Mausrad nur innerhalb dieser Fläche. */
export function PinchZoomSurface({ className, children }: PinchZoomSurfaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    const inner = innerRef.current
    if (!viewport || !inner) return

    let scale = 1
    let startDist = 0
    let startScale = 1
    let active = false

    const apply = () => {
      inner.style.transform = scale === 1 ? '' : `scale(${scale})`
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      active = true
      e.preventDefault()
      e.stopPropagation()
      startDist = touchDistance(e.touches)
      startScale = scale
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!active || e.touches.length !== 2 || startDist <= 0) return
      e.preventDefault()
      e.stopPropagation()
      const dist = touchDistance(e.touches)
      scale = Math.min(MAX, Math.max(MIN, startScale * (dist / startDist)))
      apply()
    }

    const endTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2) return
      active = false
      startDist = 0
      if (e.touches.length === 0 && scale < 0.92) {
        scale = 1
        apply()
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      scale = Math.min(MAX, Math.max(MIN, scale + delta))
      apply()
    }

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      scale = 1
      apply()
    }

    viewport.addEventListener('touchstart', onTouchStart, { passive: false })
    viewport.addEventListener('touchmove', onTouchMove, { passive: false })
    viewport.addEventListener('touchend', endTouch)
    viewport.addEventListener('touchcancel', endTouch)
    viewport.addEventListener('wheel', onWheel, { passive: false })
    viewport.addEventListener('dblclick', onDblClick)

    return () => {
      inner.style.transform = ''
      viewport.removeEventListener('touchstart', onTouchStart)
      viewport.removeEventListener('touchmove', onTouchMove)
      viewport.removeEventListener('touchend', endTouch)
      viewport.removeEventListener('touchcancel', endTouch)
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('dblclick', onDblClick)
    }
  }, [])

  return (
    <div ref={viewportRef} className={`pinch-zoom-viewport ${className ?? ''}`.trim()}>
      <div ref={innerRef} className="pinch-zoom-inner">
        {children}
      </div>
    </div>
  )
}
