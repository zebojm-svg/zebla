import { Link, useLocation } from 'react-router-dom'

type Step = 'dialog' | 'board' | 'library' | 'export'

const STEPS: Array<{ id: Step; title: string; hint: string }> = [
  { id: 'dialog', title: 'Dialog', hint: 'Text und Regie' },
  { id: 'board', title: 'Storyboard', hint: 'Bilder aus der Bibliothek' },
  { id: 'library', title: 'Bibliothek', hint: 'Posen und Hintergründe' },
  { id: 'export', title: 'Film', hint: 'Stil, Sprache, erzeugen' },
]

type Props = {
  dialogId?: string
}

export function FilmProjectNav({ dialogId }: Props) {
  const location = useLocation()
  const path = location.pathname

  const active: Step =
    path.startsWith('/library') || path.startsWith('/story')
      ? 'library'
      : path.endsWith('/board')
        ? 'board'
        : path.endsWith('/export')
          ? 'export'
          : 'dialog'

  const href = (id: Step) => {
    if (id === 'library') return dialogId ? `/library?dialog=${dialogId}` : '/library'
    if (!dialogId) return '/create'
    if (id === 'dialog') return `/dialog/${dialogId}`
    if (id === 'board') return `/dialog/${dialogId}/board`
    return `/dialog/${dialogId}/export`
  }

  return (
    <nav className="story-workflow film-project-nav" aria-label="Film-Projekt">
      {STEPS.map((step) => {
        const isActive = active === step.id
        const inner = (
          <>
            <span className="story-workflow-num">
              {step.id === 'dialog' ? '1' : step.id === 'board' ? '2' : step.id === 'library' ? '3' : '4'}
            </span>
            <span className="story-workflow-text">
              <strong>{step.title}</strong>
              <span className="muted">{step.hint}</span>
            </span>
          </>
        )
        return (
          <Link
            key={step.id}
            to={href(step.id)}
            className={`story-workflow-step${isActive ? ' is-active' : ''}`}
          >
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}
