import {
  ARM_POSES,
  HEAD_ANGLES,
  LEG_POSES,
  characterBaseName,
  normalizeArmPoseId,
  type ArmPoseId,
  type HeadAngleId,
  type LegPoseId,
} from '../../shared/character-parts'
import { HEAD_TWIST_MAX, HEAD_TWIST_MIN } from '../../shared/character-rig'
import type { ScenePreset } from '../../shared/scene-presets'
import type { StoryLibraryAsset } from '../../shared/story-types'
import {
  type CastPose,
  type SceneCast,
  slotForIncomingCharacter,
} from './story-cast'
import {
  availableArmPoses,
  availableHeadAngles,
  availableLegPoses,
  collectPoseVariants,
  findPoseVariant,
  uniqueCastCandidates,
  type PoseVariant,
  type PoseVariantSource,
} from './pose-variants'

export type EnvironmentPick = {
  key: string
  name: string
  imageUrl: string
}

type Props = {
  environments: EnvironmentPick[]
  activeEnvironmentUrl: string | null
  onPickEnvironment: (name: string, imageUrl: string) => void
  libraryCharacters: StoryLibraryAsset[]
  sessionCharacters: PoseVariantSource[]
  cast: SceneCast
  selectedSlot: 'left' | 'right' | null
  onSelectSlot: (slot: 'left' | 'right') => void
  onPlaceCharacter: (slot: 'left' | 'right', variant: PoseVariant) => void
  onRemoveSlot: (slot: 'left' | 'right') => void
  onSwapVariant: (slot: 'left' | 'right', variant: PoseVariant) => void
  onSetPose: (slot: 'left' | 'right', pose: CastPose) => void
  onLookAt: (slot: 'left' | 'right', look: boolean) => void
  onResetTransform: (slot: 'left' | 'right') => void
  onRename: (slot: 'left' | 'right', name: string) => void
  onGeneratePose: (slot: 'left' | 'right', head: HeadAngleId, leg: LegPoseId, arm: ArmPoseId) => void
  onMixHead: (slot: 'left' | 'right', donor: PoseVariant) => void
  onHeadTwist: (slot: 'left' | 'right', deg: number) => void
  onBuildRig: (slot: 'left' | 'right') => void
  generatingPose: boolean
  buildingRig: boolean
  generatePoseLabel: string
  dockError?: string
  presets: ScenePreset[]
  activePresetId: string | null
  onApplyPreset: (id: string | null) => void
}

function poseForLeg(leg: LegPoseId): CastPose {
  return leg.startsWith('sitting') ? 'sitting-sofa' : 'standing'
}

function PoseWheel<T extends string>({
  options,
  current,
  haveIds,
  onPick,
  disabled,
  label,
}: {
  options: Array<{ id: T; label: string }>
  current?: T
  haveIds: T[]
  onPick: (id: T) => void
  disabled: boolean
  label: string
}) {
  const idx = Math.max(0, options.findIndex((o) => o.id === current))
  const step = (dir: number) => {
    const next = options[(idx + dir + options.length) % options.length]
    if (next) onPick(next.id)
  }
  return (
    <div className="story-pose-wheel">
      <span className="story-pose-wheel-label">{label}</span>
      <div className="story-pose-wheel-row">
        <button
          type="button"
          className="story-pose-wheel-btn"
          aria-label={`${label}: vorherige`}
          disabled={disabled}
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <select
          className="story-pose-wheel-select"
          aria-label={label}
          value={current ?? options[0]?.id}
          disabled={disabled}
          onChange={(e) => onPick(e.target.value as T)}
        >
          {options.map((opt) => {
            const have = haveIds.includes(opt.id) || opt.id === current
            return (
              <option key={opt.id} value={opt.id}>
                {opt.label}
                {have ? '' : ' +'}
              </option>
            )
          })}
        </select>
        <button
          type="button"
          className="story-pose-wheel-btn"
          aria-label={`${label}: nächste`}
          disabled={disabled}
          onClick={() => step(1)}
        >
          ›
        </button>
      </div>
    </div>
  )
}

export function StorySceneDock({
  environments,
  activeEnvironmentUrl,
  onPickEnvironment,
  libraryCharacters,
  sessionCharacters,
  cast,
  selectedSlot,
  onSelectSlot,
  onPlaceCharacter,
  onRemoveSlot,
  onSwapVariant,
  onSetPose,
  onLookAt,
  onResetTransform,
  onRename,
  onGeneratePose,
  onMixHead,
  onHeadTwist,
  onBuildRig,
  generatingPose,
  buildingRig,
  generatePoseLabel,
  dockError,
  presets,
  activePresetId,
  onApplyPreset,
}: Props) {
  const candidates = uniqueCastCandidates(libraryCharacters, sessionCharacters)
  const member = selectedSlot ? cast[selectedSlot] : null
  const variants = member
    ? collectPoseVariants(member.displayName || member.assetName, libraryCharacters, sessionCharacters)
    : []
  const currentHead: HeadAngleId = member?.headAngle ?? 'front'
  const currentLeg: LegPoseId = member?.legPose ?? 'standing'
  const currentArm: ArmPoseId = normalizeArmPoseId(member?.armPose)
  const headOptions = availableHeadAngles(variants, currentLeg, currentArm)
  const mixableHeads = member?.rig
    ? variants.filter((v) => v.rig && v.headAngle).map((v) => v.headAngle as HeadAngleId)
    : []
  const readyHeads = [...new Set([...headOptions, ...mixableHeads])]
  const legOptions = availableLegPoses(variants, currentHead, currentArm)
  const armOptions = availableArmPoses(variants, currentHead, currentLeg)
  const busy = generatingPose || buildingRig

  const applyCombo = (head: HeadAngleId, leg: LegPoseId, arm: ArmPoseId) => {
    if (!selectedSlot || !member) return
    const match = findPoseVariant(variants, { headAngle: head, legPose: leg, armPose: arm })
    if (match) {
      onSwapVariant(selectedSlot, match)
      onSetPose(selectedSlot, poseForLeg(leg))
      return
    }
    const sameBody = head !== currentHead && leg === currentLeg && arm === currentArm
    const donor = sameBody
      ? variants.find((v) => v.headAngle === head && v.rig)
      : undefined
    if (sameBody && member.rig && donor) {
      onMixHead(selectedSlot, donor)
      return
    }
    onGeneratePose(selectedSlot, head, leg, arm)
  }

  const poseEditor = member && selectedSlot && (
          <>
            <p className="story-dock-selected">
              Ausgewählt: <strong>{member.displayName}</strong> ({selectedSlot === 'left' ? 'links' : 'rechts'})
            </p>
            <p className="story-dock-help">
              Kopf, Beine und Arme am Rad wählen. «+» in der Liste = noch zeichnen.
            </p>
            <label className="story-dock-field">
              Name im Dialog
              <input
                type="text"
                className="input"
                value={member.displayName}
                onChange={(e) => onRename(selectedSlot, e.target.value)}
              />
            </label>

            <PoseWheel
              label="Kopf"
              options={HEAD_ANGLES}
              current={currentHead}
              haveIds={readyHeads}
              onPick={(head) => applyCombo(head, currentLeg, currentArm)}
              disabled={busy}
            />
            <PoseWheel
              label="Beine / Hüfte"
              options={LEG_POSES}
              current={currentLeg}
              haveIds={legOptions}
              onPick={(leg) => applyCombo(currentHead, leg, currentArm)}
              disabled={busy}
            />
            <PoseWheel
              label="Arme"
              options={ARM_POSES}
              current={currentArm}
              haveIds={armOptions}
              onPick={(arm) => applyCombo(currentHead, currentLeg, arm)}
              disabled={busy}
            />

            {generatingPose && <p className="story-dock-muted">{generatePoseLabel}</p>}
            {buildingRig && <p className="story-dock-muted">Zerlege Figur in Kopf, Rumpf und Beine …</p>}
            {dockError && <p className="alert alert-error story-dock-error">{dockError}</p>}

            {member.rig ? (
              <div className="story-rig-box">
                <p className="story-dock-muted">Skelett aktiv — Kopf am Hals drehen:</p>
                <label className="story-transform-row">
                  <span>Kopf</span>
                  <input
                    type="range"
                    min={HEAD_TWIST_MIN}
                    max={HEAD_TWIST_MAX}
                    value={member.headTwist}
                    onChange={(e) => onHeadTwist(selectedSlot, Number(e.target.value))}
                  />
                  <span>{member.headTwist}°</span>
                </label>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => onBuildRig(selectedSlot)}
              >
                {buildingRig ? 'Zerlege …' : 'In Kopf / Rumpf / Beine zerlegen'}
              </button>
            )}

            <label className="story-cast-look-at">
              <input
                type="checkbox"
                checked={member.lookAtPartner}
                onChange={(e) => onLookAt(selectedSlot, e.target.checked)}
              />
              Zur anderen Figur drehen
            </label>
            <p className="story-dock-muted">
              Figur: ziehen · Rad = Grösse · Shift = zerren · Strg = drehen
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onResetTransform(selectedSlot)}>
              Position zurücksetzen
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onRemoveSlot(selectedSlot)}
            >
              Figur entfernen
            </button>
          </>
  )

  return (
    <aside className="story-dock" aria-label="Szene steuern">
      {member && (
        <section className="story-dock-block" id="story-dock-pose">
          <h3>Diese Figur einstellen</h3>
          {poseEditor}
        </section>
      )}

      <section className="story-dock-block">
        <h3>Hintergrund</h3>
        {environments.length === 0 ? (
          <p className="story-dock-empty">Noch keiner — unter «KI erzeugen» ein Umfeld machen.</p>
        ) : (
          <div className="story-dock-thumbs">
            {environments.map((env) => (
              <button
                key={env.key}
                type="button"
                className={`story-dock-thumb${activeEnvironmentUrl === env.imageUrl ? ' is-active' : ''}`}
                onClick={() => onPickEnvironment(env.name, env.imageUrl)}
              >
                <img src={env.imageUrl} alt="" />
                <span>{env.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="story-dock-block">
        <h3>Figuren (zwei Plätze)</h3>
        <p className="story-dock-help">Zwei Plätze: links und rechts.</p>
        <div className="story-dock-slots">
          {(['left', 'right'] as const).map((slot) => (
            <button
              key={slot}
              type="button"
              className={`story-dock-slot${selectedSlot === slot ? ' is-active' : ''}${cast[slot] ? ' has-char' : ''}`}
              onClick={() => onSelectSlot(slot)}
            >
              {slot === 'left' ? 'Links' : 'Rechts'}
              <strong>{cast[slot]?.displayName ?? 'leer'}</strong>
            </button>
          ))}
        </div>
        {candidates.length === 0 ? (
          <p className="story-dock-empty">Keine Figuren — unter «KI erzeugen» Julien oder Lucien erzeugen.</p>
        ) : (
          <div className="story-dock-thumbs">
            {candidates.map((item) => {
              const name = characterBaseName(item.assetName)
              const inUse =
                characterBaseName(cast.left?.displayName ?? '') === name ||
                characterBaseName(cast.right?.displayName ?? '') === name
              return (
                <button
                  key={item.key}
                  type="button"
                  draggable
                  className={`story-dock-thumb${inUse ? ' is-active' : ''}`}
                  onClick={() =>
                    onPlaceCharacter(slotForIncomingCharacter(cast, selectedSlot, item.assetName), item)
                  }
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({ kind: 'zebla-character', variant: item }),
                    )
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  <img src={item.imageUrl} alt="" />
                  <span>{name}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {!member && (
        <section className="story-dock-block">
          <h3>Diese Figur einstellen</h3>
          <p className="story-dock-empty">Figur im Bild oder links/rechts anklicken — dann Kopf, Hüfte, Arme.</p>
        </section>
      )}

      <section className="story-dock-block">
        <h3>Möbel dazu</h3>
        <div className="story-dock-pills">
          <button
            type="button"
            className={`story-dock-pill${!activePresetId ? ' is-active' : ''}`}
            onClick={() => onApplyPreset(null)}
          >
            Keine
          </button>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`story-dock-pill${activePresetId === preset.id ? ' is-active' : ''}`}
              onClick={() => onApplyPreset(preset.id)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
