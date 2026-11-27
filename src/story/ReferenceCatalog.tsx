import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { REFERENCE_TAG, type CatalogKind } from '../../shared/reference-catalog'
import {
  catalogHay,
  characterPlateTags,
  orderCharacters,
  orderRooms,
  roomPlateTags,
  splitCatalogArchive,
} from '../../shared/catalog-order'
import type { StoryLibraryAsset } from '../../shared/story-types'
import { StoryStylePicker, loadStoryArtStyle } from './StoryStylePicker'
import { StoryPictogram, type StoryPictogramName } from './StoryPictogram'
import { type StoryArtStyleId } from '../../shared/story-art-styles'

const KINDS: Array<{ id: CatalogKind; title: string; icon: StoryPictogramName }> = [
  { id: 'character', title: 'Figur', icon: 'person' },
  { id: 'environment', title: 'Raum', icon: 'room' },
  { id: 'sound', title: 'Geräusch', icon: 'sound' },
]

function kindLabel(kind: CatalogKind): { field: string; button: string; hint: string } {
  if (kind === 'character') {
    return {
      field: 'Wie sieht die Figur aus?',
      button: 'Referenzbild zeichnen',
      hint: 'Das kostet ein Bild. Der Satz wird gespeichert und geht bei jeder neuen Sicht mit.',
    }
  }
  if (kind === 'environment') {
    return {
      field: 'Wie sieht der Raum aus?',
      button: 'Raum zeichnen',
      hint: 'Das kostet ein Bild. Fenster, Boden und Herd bleiben diese Referenz.',
    }
  }
  return {
    field: 'Was hört man?',
    button: 'Geräusch merken',
    hint: 'Zebla merkt sich den Namen und den Satz. Eine Ton-Datei kommt mit der Regie.',
  }
}

export function ReferenceCatalog({
  assets,
  onChange,
}: {
  assets: StoryLibraryAsset[]
  onChange: () => Promise<void> | void
}) {
  const [kind, setKind] = useState<CatalogKind>('character')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [styleId, setStyleId] = useState<StoryArtStyleId>(() => loadStoryArtStyle())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [changeById, setChangeById] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const copy = kindLabel(kind)
  const needle = query.trim().toLowerCase()
  const { active, archive } = useMemo(() => splitCatalogArchive(assets), [assets])
  const characterGroups = useMemo(() => {
    const groups = orderCharacters(active)
    if (!needle) return groups
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((stack) =>
          [stack.displayName, stack.styleLabel, ...stack.hidden.map(catalogHay), catalogHay(stack.cover)]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [active, needle])
  const archiveGroups = useMemo(() => {
    const groups = orderCharacters(archive)
    if (!needle) return groups
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((stack) =>
          [stack.displayName, stack.styleLabel, ...stack.hidden.map(catalogHay), catalogHay(stack.cover)]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [archive, needle])
  const roomGroups = useMemo(() => {
    const groups = orderRooms(assets)
    if (!needle) return groups
    return groups
      .map((group) => ({
        ...group,
        items: group.items
          .map((place) => ({
            ...place,
            rooms: place.rooms.filter((room) => catalogHay(room).includes(needle) || place.placeLabel.toLowerCase().includes(needle)),
          }))
          .filter((place) => place.rooms.length > 0),
      }))
      .filter((group) => group.items.length > 0)
  }, [assets, needle])
  const sounds = assets.filter((asset) => asset.type === 'sound' && (!needle || catalogHay(asset).includes(needle)))

  const create = async () => {
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmedName || !trimmedDescription) {
      setError('Name und Beschreibung fehlen.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (kind === 'sound') {
        await api.story.saveToLibrary({
          type: 'sound',
          name: trimmedName,
          description: trimmedDescription,
          tags: [REFERENCE_TAG],
        })
      } else if (kind === 'character') {
        const drawn = await api.story.generateCharacter(
          trimmedName,
          trimmedDescription,
          styleId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
        )
        await api.story.saveToLibrary({
          type: 'character',
          name: trimmedName,
          description: trimmedDescription,
          imageUrl: drawn.imageUrl,
          tags: characterPlateTags(drawn.styleId, trimmedDescription),
          styleId: drawn.styleId,
          prompt: drawn.prompt,
          legPoseId: 'standing',
          headAngleId: 'front',
          armPoseId: 'relaxed',
        })
      } else {
        const drawn = await api.story.generateEnvironment(trimmedName, trimmedDescription, styleId)
        await api.story.saveToLibrary({
          type: 'environment',
          name: trimmedName,
          description: trimmedDescription,
          imageUrl: drawn.imageUrl,
          tags: roomPlateTags(drawn.styleId, trimmedDescription),
          styleId: drawn.styleId,
          prompt: drawn.prompt,
        })
      }
      setName('')
      setDescription('')
      await onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt.')
    } finally {
      setBusy(false)
    }
  }

  const varyRoom = async (asset: StoryLibraryAsset) => {
    const change = (changeById[asset.id] ?? '').trim()
    if (!change) {
      setError('Schreib kurz, was anders sein soll. Zum Beispiel: anderes Sofa.')
      return
    }
    setPendingId(asset.id)
    setError('')
    try {
      const drawn = await api.story.generateEnvironment(
        asset.name,
        asset.description?.trim() || asset.name,
        asset.styleId || styleId,
        { imageUrl: asset.imageUrl, change },
      )
      await api.story.saveToLibrary({
        type: 'environment',
        name: asset.name,
        description: `${asset.description?.trim() || asset.name}. Anders: ${change}`,
        imageUrl: drawn.imageUrl,
        tags: roomPlateTags(drawn.styleId, `${asset.description ?? ''} ${change}`),
        styleId: drawn.styleId,
        prompt: drawn.prompt,
        basisId: asset.id,
      })
      setChangeById((prev) => ({ ...prev, [asset.id]: '' }))
      await onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Der Raum konnte nicht gezeichnet werden.')
    } finally {
      setPendingId(null)
    }
  }

  const remove = async (asset: StoryLibraryAsset) => {
    if (!window.confirm(`„${asset.name}“ aus dem Katalog nehmen?`)) return
    setPendingId(asset.id)
    setError('')
    try {
      await api.story.deleteFromLibrary(asset.id)
      await onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.')
    } finally {
      setPendingId(null)
    }
  }

  const archiveCount = archiveGroups.reduce((sum, group) => sum + group.items.length, 0)

  const renderCharacterGroups = (groups: typeof characterGroups, prefix: string) =>
    groups.map((group) => (
      <section key={`${prefix}-${group.styleId}`} className="catalog-style-block">
        <h2>{group.styleLabel}</h2>
        <div className="story-character-grid">
          {group.items.map((stack) => {
            const key = `${prefix}-${stack.key}`
            const open = openKey === key || (needle.length > 0 && stack.hidden.length > 0)
            return (
              <div key={key} className="catalog-stack">
                <button
                  type="button"
                  className="catalog-cover"
                  aria-expanded={open}
                  onClick={() => setOpenKey(open && openKey === key ? null : key)}
                >
                  {stack.cover.imageUrl ? (
                    <img src={stack.cover.imageUrl} alt={stack.displayName} />
                  ) : (
                    <div className="catalog-sound-mark">
                      <StoryPictogram name="person" />
                    </div>
                  )}
                  <span className="catalog-cover-name">{stack.displayName}</span>
                  {stack.hidden.length > 0 ? (
                    <span className="catalog-cover-more muted">{stack.hidden.length} weitere</span>
                  ) : stack.cover.prompt ? (
                    <span className="catalog-cover-more muted">Satz gespeichert</span>
                  ) : null}
                </button>
                {open ? (
                  <div className="catalog-hidden">
                    {stack.cover.prompt ? (
                      <details className="catalog-prompt">
                        <summary>Satz an die Bild-KI</summary>
                        <p className="muted">{stack.cover.prompt}</p>
                      </details>
                    ) : stack.cover.description ? (
                      <p className="muted">{stack.cover.description}</p>
                    ) : null}
                    {stack.hidden.map((asset) => (
                      <article key={asset.id} className="story-character-card">
                        {asset.imageUrl ? <img src={asset.imageUrl} alt={asset.name} /> : null}
                        <p>{asset.name}</p>
                        <div className="story-character-card-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={pendingId === asset.id}
                            onClick={() => void remove(asset)}
                          >
                            Löschen
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    ))

  return (
    <section className="reference-catalog">
      <div className="library-shelf-tabs" role="tablist" aria-label="Katalog">
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={kind === item.id}
            className={`library-shelf-tab${kind === item.id ? ' is-active' : ''}`}
            onClick={() => {
              setKind(item.id)
              setName('')
              setDescription('')
              setError('')
            }}
          >
            <StoryPictogram name={item.icon} />
            <strong>{item.title}</strong>
          </button>
        ))}
      </div>

      <form
        className="catalog-form"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <label>
          Name
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === 'character' ? 'Reto' : kind === 'environment' ? 'Küche' : 'Glas fällt'}
          />
        </label>
        <label>
          {copy.field}
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              kind === 'sound'
                ? 'Ein Glas fällt auf den Boden und zerspringt.'
                : kind === 'character'
                  ? 'Junge, dunkle Haare, blaues Hemd'
                  : 'Helle Küche, Gasherd, Fenster zur Strasse'
            }
          />
        </label>
        {kind !== 'sound' ? <StoryStylePicker value={styleId} onChange={setStyleId} compact /> : null}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '…' : copy.button}
          </button>
          <p className="hint">{copy.hint}</p>
        </div>
      </form>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <input
        className="input catalog-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Suchen: Reto, Küche, Brille, Wald …"
      />

      {kind === 'character' ? (
        <>
          {characterGroups.length === 0 && archiveGroups.length === 0 ? (
            <p className="muted">
              {needle
                ? 'Nichts gefunden.'
                : 'Noch keine neue Figur. Oben ein Referenzbild zeichnen. Der Satz wird mitgespeichert.'}
            </p>
          ) : characterGroups.length > 0 ? (
            renderCharacterGroups(characterGroups, 'neu')
          ) : null}
          {archiveCount > 0 ? (
            needle ? (
              <section className="catalog-archive">
                <h2>Archiv</h2>
                {renderCharacterGroups(archiveGroups, 'archiv')}
              </section>
            ) : (
              <details className="catalog-archive">
                <summary>Archiv ({archiveCount})</summary>
                <p className="muted">
                  Bisherige Figuren. Sie bleiben für alte Filme. Neue Geschichten bekommen oben eine neue Figur.
                </p>
                {renderCharacterGroups(archiveGroups, 'archiv')}
              </details>
            )
          ) : null}
        </>
      ) : null}

      {kind === 'environment' ? (
        roomGroups.length === 0 ? (
          <p className="muted">Noch kein Raum. Oben einen Raum zeichnen.</p>
        ) : (
          roomGroups.map((group) => (
            <section key={group.styleId} className="catalog-style-block">
              <h2>{group.styleLabel}</h2>
              {group.items.map((place) => (
                <div key={place.placeId} className="catalog-place">
                  <h3>{place.placeLabel}</h3>
                  <div className="story-character-grid">
                    {place.rooms.map((asset) => (
                      <article key={asset.id} className="story-character-card catalog-card is-room">
                        {asset.imageUrl ? (
                          <img src={asset.imageUrl} alt={asset.name} />
                        ) : (
                          <div className="catalog-sound-mark">
                            <StoryPictogram name="room" />
                          </div>
                        )}
                        <p>{asset.name}</p>
                        {asset.description ? <p className="story-card-subtitle muted">{asset.description}</p> : null}
                        <label className="catalog-change">
                          Was soll anders sein?
                          <input
                            className="input"
                            value={changeById[asset.id] ?? ''}
                            onChange={(event) =>
                              setChangeById((prev) => ({ ...prev, [asset.id]: event.target.value }))
                            }
                            placeholder="anderes Sofa, gleicher Herd"
                          />
                        </label>
                        <div className="story-character-card-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={pendingId === asset.id || busy}
                            onClick={() => void varyRoom(asset)}
                          >
                            {pendingId === asset.id ? '…' : 'Raum wie dieser'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={pendingId === asset.id || busy}
                            onClick={() => void remove(asset)}
                          >
                            Löschen
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))
        )
      ) : null}

      {kind === 'sound' ? (
        sounds.length === 0 ? (
          <p className="muted">Noch kein Geräusch. Oben den Namen und den Satz merken.</p>
        ) : (
          <div className="story-character-grid">
            {sounds.map((asset) => (
              <article key={asset.id} className="story-character-card catalog-card">
                <div className="catalog-sound-mark">
                  <StoryPictogram name="sound" />
                </div>
                <p>{asset.name}</p>
                {asset.description ? <p className="story-card-subtitle muted">{asset.description}</p> : null}
                <div className="story-character-card-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={pendingId === asset.id}
                    onClick={() => void remove(asset)}
                  >
                    Löschen
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : null}
    </section>
  )
}
