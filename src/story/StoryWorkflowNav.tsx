import { Link } from 'react-router-dom'

export type StoryWorkflowStep = 'dialog' | 'assets' | 'actions' | 'scene'

const STEPS: Array<{
  id: StoryWorkflowStep
  num: number
  title: string
  hint: string
  href?: string
}> = [
  {
    id: 'dialog',
    num: 1,
    title: 'Storyboard',
    hint: 'Geschichte und Dialog schreiben oder per KI erzeugen',
    href: '/create',
  },
  {
    id: 'assets',
    num: 2,
    title: 'Bilder & Bibliothek',
    hint: 'KI erzeugen oder aus Bibliothek wählen — wiederverwendet = kostenlos',
  },
  {
    id: 'actions',
    num: 3,
    title: 'Aktionen',
    hint: 'Später: sprechen / blinzeln (günstig), dann erst Film',
  },
  {
    id: 'scene',
    num: 4,
    title: 'Szene',
    hint: 'Alles zusammen rendern & abspielen',
  },
]

type Props = {
  active: StoryWorkflowStep
  onStep?: (step: StoryWorkflowStep) => void
}

export function StoryWorkflowNav({ active, onStep }: Props) {
  return (
    <nav className="story-workflow" aria-label="Story-Workflow">
      {STEPS.map((step) => {
        const isActive = step.id === active
        const inner = (
          <>
            <span className="story-workflow-num">{step.num}</span>
            <span className="story-workflow-text">
              <strong>{step.title}</strong>
              <span className="muted">{step.hint}</span>
            </span>
          </>
        )

        if (step.href) {
          return (
            <Link
              key={step.id}
              to={step.href}
              className={`story-workflow-step${isActive ? ' is-active' : ''}`}
            >
              {inner}
            </Link>
          )
        }

        return (
          <button
            key={step.id}
            type="button"
            className={`story-workflow-step${isActive ? ' is-active' : ''}`}
            onClick={() => onStep?.(step.id)}
          >
            {inner}
          </button>
        )
      })}
    </nav>
  )
}
