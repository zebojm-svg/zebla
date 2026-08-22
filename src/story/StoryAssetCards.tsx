import type { StoryLibraryAsset } from '../../shared/story-types'

type CharacterCardItem = {
  key: string
  name: string
  imageUrl: string
  tags?: string[]
  subtitle?: string
}

type Props = {
  item: CharacterCardItem
  onPlace: () => void
  onSave?: () => void
  saving?: boolean
  onDelete?: () => void
  extraAction?: { label: string; onClick: () => void; primary?: boolean }
}

export function StoryCharacterCard({
  item,
  onPlace,
  onSave,
  saving,
  onDelete,
  extraAction,
}: Props) {
  return (
    <article className="story-character-card">
      <img src={item.imageUrl} alt={`Figur ${item.name}`} />
      <p>{item.name}</p>
      {item.subtitle && <p className="story-card-subtitle muted">{item.subtitle}</p>}
      {item.tags && item.tags.length > 0 && (
        <div className="story-tag-row">
          {item.tags.map((tag) => (
            <span key={tag} className="story-tag">{tag}</span>
          ))}
        </div>
      )}
      <div className="story-character-card-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onPlace}>
          Ins Bild
        </button>
        {extraAction && (
          <button
            type="button"
            className={`btn btn-sm ${extraAction.primary ? 'btn-primary' : 'btn-secondary'}`}
            onClick={extraAction.onClick}
          >
            {extraAction.label}
          </button>
        )}
        {onSave && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onSave}>
            {saving ? 'Speichere …' : 'In Bibliothek'}
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onDelete}>
            Löschen
          </button>
        )}
      </div>
    </article>
  )
}

export function StoryEnvironmentCard({
  item,
  onUse,
  onSave,
  saving,
  onDelete,
  isActive,
}: {
  item: CharacterCardItem
  onUse: () => void
  onSave?: () => void
  saving?: boolean
  onDelete?: () => void
  isActive?: boolean
}) {
  return (
    <article className={`story-character-card${isActive ? ' is-active' : ''}`}>
      <img src={item.imageUrl} alt={`Umfeld ${item.name}`} />
      <p>{item.name}</p>
      {isActive && <p className="story-card-subtitle">✓ Aktiver Hintergrund</p>}
      {item.tags && item.tags.length > 0 && (
        <div className="story-tag-row">
          {item.tags.map((tag) => (
            <span key={tag} className="story-tag">{tag}</span>
          ))}
        </div>
      )}
      <div className="story-character-card-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onUse}>
          {isActive ? '✓ Hintergrund aktiv' : 'Hintergrund setzen'}
        </button>
        {onSave && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onSave}>
            {saving ? 'Speichere …' : 'In Bibliothek'}
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onDelete}>
            Löschen
          </button>
        )}
      </div>
    </article>
  )
}

export type { StoryLibraryAsset }
