import { type ReactNode, useEffect, useRef } from 'react'

/** Wie <details>, mit optional allem auf- oder zuklappen (Szene). */
export function FilmDetails({
  className,
  summary,
  children,
  openOverride,
}: {
  className?: string
  summary: ReactNode
  children: ReactNode
  /** gesetzt = alle gleich; fehlt = Nutzer klappt selbst */
  openOverride?: boolean
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (openOverride !== undefined && ref.current) ref.current.open = openOverride
  }, [openOverride])
  return (
    <details ref={ref} className={className}>
      <summary>{summary}</summary>
      {children}
    </details>
  )
}