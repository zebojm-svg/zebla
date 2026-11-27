import { useState } from 'react'
import { api } from '../api/client'
import { REFERENCE_TAG, isCatalogReference, type CatalogKind } from '../../shared/reference-catalog'
import type { StoryLibraryAsset } from '../../shared/story-types'
import { StoryStylePicker, loadStoryArtStyle } from './StoryStylePicker'
import { StoryPictogram, type StoryPictogramName } from './StoryPictogram'
import type { StoryArtStyleId } from '../../shared/story-art-styles'

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
      hint: 'Das kostet ein Bild. Danach geht dieses Gesicht bei jeder neuen Sicht mit.',
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

  const copy = kindLabel(kind)
  const ofKind = assets.filter((asset) => asset.type === kind)
  const references = ofKind.filter((asset) => isCatalogReference(asset))
  const others = ofKind.filter((asset) => !isCatalogReference(asset))

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
          tags: [REFERENCE_TAG, 'standing-front'],
          styleId: drawn.styleId,
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
          tags: [REFERENCE_TAG],
          styleId: drawn.styleId,
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

  const mark = async (id: string) => {
    setPendingId(id)
    setError('')
    try {
      await api.story.markReference(id)
      await onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Referenz konnte nicht gesetzt werden.')
    } finally {
      setPendingId(null)
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
        tags: [REFERENCE_TAG],
        styleId: drawn.styleId,
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

      {references.length === 0 ? (
        <p className="muted">Noch keine Referenz. Oben anlegen, oder unten eine bestehende nehmen.</p>
      ) : (
        <div className="story-character-grid">
          {references.map((asset) => {
            const pending = pendingId === asset.id
            const basis = asset.basisId
              ? assets.find((item) => item.id === asset.basisId)?.name
              : ''
            return (
              <article
                key={asset.id}
                className={`story-character-card catalog-card${asset.type === 'environment' ? ' is-room' : ''}`}
              >
                {asset.type === 'sound' || !asset.imageUrl ? (
                  <div className="catalog-sound-mark">
                    <StoryPictogram name={asset.type === 'environment' ? 'room' : asset.type === 'character' ? 'person' : 'sound'} />
                  </div>
                ) : (
                  <img src={asset.imageUrl} alt={asset.name} />
                )}
                <p>{asset.name}</p>
                {asset.description ? <p className="story-card-subtitle muted">{asset.description}</p> : null}
                {basis ? <p className="story-card-subtitle muted">Wie {basis}</p> : null}
                {asset.type === 'environment' ? (
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
                ) : null}
                <div className="story-character-card-actions">
                  {asset.type === 'environment' ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={pending || busy}
                      onClick={() => void varyRoom(asset)}
                    >
                      {pending ? '…' : 'Raum wie dieser'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={pending || busy}
                    onClick={() => void remove(asset)}
                  >
                    Löschen
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {others.length > 0 ? (
        <div className="catalog-others">
          <h3>Schon da, noch keine Referenz</h3>
          <div className="story-character-grid">
            {others.map((asset) => (
              <article key={asset.id} className="story-character-card">
                {asset.imageUrl ? <img src={asset.imageUrl} alt={asset.name} /> : null}
                <p>{asset.name}</p>
                <div className="story-character-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={pendingId === asset.id || busy}
                    onClick={() => void mark(asset.id)}
                  >
                    {pendingId === asset.id ? '…' : 'Das ist die Referenz'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
