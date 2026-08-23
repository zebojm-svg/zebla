import {
  STILL_POSES,
  stillsEngineLabelDe,
  type StillPoseId,
  type StillsEngineId,
  type StillsEngineInfo,
} from '../../shared/story-stills'
import type { StoryCharacterLook } from '../../shared/story-character-looks'
import { normalizeCharacterLookName } from '../../shared/story-character-looks'

type Props = {
  looks: StoryCharacterLook[]
  characterName: string
  characterDescription: string
  activeLook?: StoryCharacterLook
  onPickLook: (look: StoryCharacterLook) => void
  onName: (name: string) => void
  onDescription: (text: string) => void
  generating: boolean
  generatingPoseId: StillPoseId | null
  error: string
  lockEngine?: StillsEngineId
  engines?: StillsEngineInfo[]
  masterUrl?: string
  masterName?: string
  onGenerateMaster: () => void
  onGeneratePose: (poseId: StillPoseId) => void
}

export function StoryStillsPanel({
  looks,
  characterName,
  characterDescription,
  activeLook,
  onPickLook,
  onName,
  onDescription,
  generating,
  generatingPoseId,
  error,
  lockEngine,
  engines,
  masterUrl,
  masterName,
  onGenerateMaster,
  onGeneratePose,
}: Props) {
  const busy = generating || generatingPoseId != null
  const lockReady = lockEngine === 'flux-kontext-replicate' || lockEngine === 'flux-kontext-fal'
  const lockInfo = engines?.find((e) => e.id === lockEngine)

  return (
    <section className="story-generate-panel story-sofa-cta" id="stills-lock">
      <h3>Gleiche Figur, verschiedene Posen</h3>
      <p className="muted">
        Zuerst ein <strong>Stamm-Bild</strong> (Gesicht + Kleidung). Danach jede Pose aus diesem
        Foto — nicht aus einem neuen Text. So bleibt Julien Julien.
      </p>
      <p className={`story-engine-pill${lockReady ? ' is-ready' : ' is-fallback'}`}>
        {lockEngine
          ? `KI für Posen: ${stillsEngineLabelDe(lockEngine)}`
          : 'KI-Status wird geladen …'}
        {lockInfo ? ` — ${lockInfo.hintDe}` : ''}
      </p>

      <div className="story-character-form">
        <div className="story-look-picks" role="group" aria-label="Figuren-Looks">
          {looks.map((look) => (
            <button
              key={look.name}
              type="button"
              className={`story-look-pick${
                normalizeCharacterLookName(characterName) === normalizeCharacterLookName(look.name)
                  ? ' is-active'
                  : ''
              }`}
              disabled={busy}
              onClick={() => onPickLook(look)}
            >
              {look.name}
            </button>
          ))}
        </div>
        {activeLook && <p className="muted story-look-hint">{activeLook.hintDe}</p>}
        <input
          type="text"
          className="input"
          placeholder="Figurenname (z.B. Julien)"
          value={characterName}
          onChange={(e) => onName(e.target.value)}
          disabled={busy}
        />
        <textarea
          className="input"
          rows={3}
          placeholder="Beschreibung (Alter, Haare, Kleidung …)"
          value={characterDescription}
          onChange={(e) => onDescription(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !characterName.trim() || !characterDescription.trim()}
          onClick={onGenerateMaster}
        >
          {generatingPoseId === 'standing-front'
            ? 'Zeichne Stamm-Bild …'
            : '1. Stamm-Bild zeichnen (stehen, ganz)'}
        </button>
      </div>

      {masterUrl && (
        <div className="story-master-preview">
          <img src={masterUrl} alt={`Stamm-Bild ${masterName ?? characterName}`} />
          <p className="muted">
            Stamm-Bild von <strong>{masterName ?? characterName}</strong>. Nächste Posen nehmen
            genau dieses Foto.
          </p>
        </div>
      )}

      <h4 className="story-library-heading">2. Posen aus dem Stamm-Bild</h4>
      <p className="muted">
        Jede Pose ist ein eigenes Standbild (transparent). Sprechen und Blinzeln kommen später —
        günstig, Figur bleibt still. Bewegungsfilm erst, wenn diese Bilder stimmen.
      </p>
      <div className="story-still-poses">
        {STILL_POSES.filter((p) => p.id !== 'standing-front').map((pose) => (
          <button
            key={pose.id}
            type="button"
            className="story-still-pose-btn"
            disabled={busy || !masterUrl}
            onClick={() => onGeneratePose(pose.id)}
          >
            <strong>{pose.label}</strong>
            <span>{generatingPoseId === pose.id ? 'Zeichne …' : pose.hintDe}</span>
          </button>
        ))}
      </div>
      {!masterUrl && (
        <p className="muted">Ohne Stamm-Bild sind die Pose-Knöpfe gesperrt — sonst malt die KI ein neues Gesicht.</p>
      )}
      {error && <p className="alert alert-error">{error}</p>}
    </section>
  )
}
