import { useEffect, type RefObject } from 'react'

const MIN = 0.6
const MAX = 2.8

function touchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

function applyTransform(el: HTMLElement, scale: number) {
  el.style.transform = `scale(${scale})`
  el.style.transformOrigin = 'center center'
}

/**
 * Zwei-Finger-Zoom und Strg+Mausrad nur auf dem referenzierten Element.
 */
export function usePinchZoom(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    let scale = 1
    let startDist = 0
    let startScale = 1

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.stopPropagation()
      startDist = touchDistance(e.touches)
      startScale = scale
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDist <= 0) return
      e.preventDefault()
      e.stopPropagation()
      const dist = touchDistance(e.touches)
      scale = Math.min(MAX, Math.max(MIN, startScale * (dist / startDist)))
      applyTransform(el, scale)
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0
      if (e.touches.length === 0 && scale < 0.92) {
        scale = 1
        applyTransform(el, 1)
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      scale = Math.min(MAX, Math.max(MIN, scale + delta))
      applyTransform(el, scale)
    }

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault()
      scale = 1
      applyTransform(el, 1)
    }

    el.style.touchAction = 'none'
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('dblclick', onDblClick)

    return () => {
      el.style.transform = ''
      el.style.transformOrigin = ''
      el.style.touchAction = ''
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('dblclick', onDblClick)
    }
  }, [ref, enabled])
}
