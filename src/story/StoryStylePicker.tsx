import {
  DEFAULT_STORY_ART_STYLE,
  STORY_ART_STYLES,
  getStoryArtStyle,
  type StoryArtStyleId,
} from '../../shared/story-art-styles'

const STORAGE_KEY = 'zebla-story-art-style-v2'

export function loadStoryArtStyle(): StoryArtStyleId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && STORY_ART_STYLES.some((s) => s.id === raw)) {
      return raw as StoryArtStyleId
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_STORY_ART_STYLE
}

export function saveStoryArtStyle(id: StoryArtStyleId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

type Props = {
  value: StoryArtStyleId
  onChange: (id: StoryArtStyleId) => void
  compact?: boolean
}

export function StoryStylePicker({ value, onChange, compact }: Props) {
  const selected = getStoryArtStyle(value)

  return (
    <div className={`story-style-picker${compact ? ' story-style-picker-compact' : ''}`}>
      <label className="story-style-picker-label" htmlFor="story-art-style">
        Bildstil
      </label>
      <select
        id="story-art-style"
        className="input"
        value={value}
        onChange={(e) => {
          const id = e.target.value as StoryArtStyleId
          onChange(id)
          saveStoryArtStyle(id)
        }}
      >
        {STORY_ART_STYLES.map((style) => (
          <option key={style.id} value={style.id}>
            {style.label}
          </option>
        ))}
      </select>
      {!compact && <p className="muted story-style-hint">{selected.description}</p>}
    </div>
  )
}

export function storyStyleLabel(styleId?: string | null): string | undefined {
  if (!styleId) return undefined
  return getStoryArtStyle(styleId).label
}
