import type { CastTransform } from './story-cast'

type Props = {
  transform: CastTransform
  onChange: (patch: Partial<CastTransform>) => void
  onReset: () => void
}

export function CastTransformControls({ transform, onChange, onReset }: Props) {
  return (
    <div className="story-transform-controls">
      <p className="story-transform-hint">
        Ziehen = schieben · Mausrad = zoomen · Shift+Ziehen = drehen · oder Regler:
      </p>
      <label className="story-transform-row">
        <span>Links/Rechts</span>
        <input
          type="range"
          min={-350}
          max={350}
          value={transform.offsetX}
          onChange={(e) => onChange({ offsetX: Number(e.target.value) })}
        />
        <span>{transform.offsetX}px</span>
      </label>
      <label className="story-transform-row">
        <span>Hoch/Runter</span>
        <input
          type="range"
          min={-350}
          max={350}
          value={transform.offsetY}
          onChange={(e) => onChange({ offsetY: Number(e.target.value) })}
        />
        <span>{transform.offsetY}px</span>
      </label>
      <label className="story-transform-row">
        <span>Grösse</span>
        <input
          type="range"
          min={40}
          max={180}
          value={Math.round(transform.scale * 100)}
          onChange={(e) => onChange({ scale: Number(e.target.value) / 100 })}
        />
        <span>{Math.round(transform.scale * 100)}%</span>
      </label>
      <label className="story-transform-row">
        <span>Breite (Zerren)</span>
        <input
          type="range"
          min={50}
          max={150}
          value={Math.round((transform.scaleX ?? 1) * 100)}
          onChange={(e) => onChange({ scaleX: Number(e.target.value) / 100 })}
        />
        <span>{Math.round((transform.scaleX ?? 1) * 100)}%</span>
      </label>
      <label className="story-transform-row">
        <span>Höhe (Zerren)</span>
        <input
          type="range"
          min={50}
          max={150}
          value={Math.round((transform.scaleY ?? 1) * 100)}
          onChange={(e) => onChange({ scaleY: Number(e.target.value) / 100 })}
        />
        <span>{Math.round((transform.scaleY ?? 1) * 100)}%</span>
      </label>
      <label className="story-transform-row">
        <span>Drehung</span>
        <input
          type="range"
          min={-90}
          max={90}
          value={transform.rotation}
          onChange={(e) => onChange({ rotation: Number(e.target.value) })}
        />
        <span>{transform.rotation}°</span>
      </label>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
        Position zurücksetzen
      </button>
    </div>
  )
}
