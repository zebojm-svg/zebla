import type { StoryMeta } from '../types'
import { normalizeStoryMeta } from '../../shared/story-project'

type Props = {
  value: StoryMeta | null | undefined
  onChange: (next: StoryMeta) => void
  disabled?: boolean
}

export function StoryMetaSheet({ value, onChange, disabled }: Props) {
  const meta = normalizeStoryMeta(value)
  const set = (key: keyof StoryMeta, next: string) => {
    onChange({ ...meta, [key]: next })
  }

  return (
    <section className="panel story-meta-sheet">
      <h2>Diese Geschichte</h2>
      <p className="muted">
        Ein Blatt für alle Szenen: wer spielt, welche Stimmen, welche Räume. So bleiben die Bilder
        gleich, auch wenn du später eine Szene nachdrehst.
      </p>
      <div className="story-meta-grid">
        <label>
          Wer spielt mit
          <textarea
            rows={2}
            disabled={disabled}
            value={meta.castNote}
            onChange={(e) => set('castNote', e.target.value)}
            placeholder="Julien, Tara — gleiche Gesichter wie in der Bibliothek"
          />
        </label>
        <label>
          Stimmen
          <textarea
            rows={2}
            disabled={disabled}
            value={meta.voicesNote}
            onChange={(e) => set('voicesNote', e.target.value)}
            placeholder="Julien ruhig, Tara flotter — fest für den ganzen Film"
          />
        </label>
        <label>
          Räume
          <textarea
            rows={2}
            disabled={disabled}
            value={meta.roomsNote}
            onChange={(e) => set('roomsNote', e.target.value)}
            placeholder="Parkbank, Rolltreppe, Klassenzimmer"
          />
        </label>
        <label>
          Licht und Blick
          <textarea
            rows={2}
            disabled={disabled}
            value={meta.lookNote}
            onChange={(e) => set('lookNote', e.target.value)}
            placeholder="Herbstlicht, Kamera etwas seitlich, nicht von oben"
          />
        </label>
      </div>
    </section>
  )
}
