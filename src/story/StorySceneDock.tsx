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
import type { ScenePreset } from '../../shared/scene-presets'
import type { StoryLibraryAsset } from '../../shared/story-types'
import {
  type CastPose,
  type CastTransform,
  type SceneCast,
} from './story-cast'
import { CastTransformControls } from './CastTransformControls'
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
  onTransform: (slot: 'left' | 'right', patch: Partial<CastTransform>) => void
  onResetTransform: (slot: 'left' | 'right') => void
  onRename: (slot: 'left' | 'right', name: string) => void
  onGeneratePose: (slot: 'left' | 'right', head: HeadAngleId, leg: LegPoseId, arm: ArmPoseId) => void
  generatingPose: boolean
  generatePoseLabel: string
  presets: ScenePreset[]
  activePresetId: string | null
  onApplyPreset: (id: string | null) => void
}

function poseForLeg(leg: LegPoseId): CastPose {
  return leg.startsWith('sitting') ? 'sitting-sofa' : 'standing'
}

function PosePills<T extends string>({
  options,
  current,
  haveIds,
  onPick,
  disabled,
  groupLabel,
}: {
  options: Array<{ id: T; label: string }>
  current?: T
  haveIds: T[]
  onPick: (id: T) => void
  disabled: boolean
  groupLabel: string
}) {
  return (
    <div className="story-dock-pills" role="group" aria-label={groupLabel}>
      {options.map((opt) => {
        const have = haveIds.includes(opt.id) || current === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            className={`story-dock-pill${current === opt.id ? ' is-active' : ''}${have ? '' : ' is-missing'}`}
            onClick={() => onPick(opt.id)}
            disabled={disabled}
            title={have ? opt.label : `${opt.label} — noch erzeugen`}
          >
            {opt.label}
            {!have ? ' +' : ''}
          </button>
        )
      })}
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
  onTransform,
  onResetTransform,
  onRename,
  onGeneratePose,
  generatingPose,
  generatePoseLabel,
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
  const legOptions = availableLegPoses(variants, currentHead, currentArm)
  const armOptions = availableArmPoses(variants, currentHead, currentLeg)

  const applyCombo = (head: HeadAngleId, leg: LegPoseId, arm: ArmPoseId) => {
    if (!selectedSlot || !member) return
    const match = findPoseVariant(variants, { headAngle: head, legPose: leg, armPose: arm })
    if (match) {
      onSwapVariant(selectedSlot, match)
      onSetPose(selectedSlot, poseForLeg(leg))
      return
    }
    onGeneratePose(selectedSlot, head, leg, arm)
  }

  return (
    <aside className="story-dock" aria-label="Szene steuern">
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
        <h3>Figur</h3>
        <p className="story-dock-help">Zuerst links oder rechts wählen, dann eine Figur klicken.</p>
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
                  className={`story-dock-thumb${inUse ? ' is-active' : ''}`}
                  onClick={() => onPlaceCharacter(selectedSlot ?? (cast.left ? 'right' : 'left'), item)}
                >
                  <img src={item.imageUrl} alt="" />
                  <span>{name}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="story-dock-block">
        <h3>Position & Pose</h3>
        {!member ? (
          <p className="story-dock-empty">Figur im Bild anklicken — dann Kopf, Beine, Arme wählen.</p>
        ) : (
          <>
            <p className="story-dock-selected">
              Ausgewählt: <strong>{member.displayName}</strong> ({selectedSlot === 'left' ? 'links' : 'rechts'})
            </p>
            <label className="story-dock-field">
              Name im Dialog
              <input
                type="text"
                className="input"
                value={member.displayName}
                onChange={(e) => selectedSlot && onRename(selectedSlot, e.target.value)}
              />
            </label>

            <p className="story-dock-label">Kopf</p>
            <PosePills
              groupLabel="Kopf"
              options={HEAD_ANGLES}
              current={currentHead}
              haveIds={headOptions}
              onPick={(head) => applyCombo(head, currentLeg, currentArm)}
              disabled={generatingPose}
            />

            <p className="story-dock-label">Beine</p>
            <PosePills
              groupLabel="Beine"
              options={LEG_POSES}
              current={currentLeg}
              haveIds={legOptions}
              onPick={(leg) => applyCombo(currentHead, leg, currentArm)}
              disabled={generatingPose}
            />

            <p className="story-dock-label">Arme</p>
            <PosePills
              groupLabel="Arme"
              options={ARM_POSES}
              current={currentArm}
              haveIds={armOptions}
              onPick={(arm) => applyCombo(currentHead, currentLeg, arm)}
              disabled={generatingPose}
            />

            {generatingPose && <p className="story-dock-muted">{generatePoseLabel}</p>}
            <p className="story-dock-help">
              «+» erzeugt genau diese Kombination neu (ein Bild). Fehlt z.B. «Jubelnd», einfach draufklicken.
            </p>

            <label className="story-cast-look-at">
              <input
                type="checkbox"
                checked={member.lookAtPartner}
                onChange={(e) => selectedSlot && onLookAt(selectedSlot, e.target.checked)}
              />
              Zur anderen Figur drehen (spiegeln)
            </label>

            <CastTransformControls
              transform={member.transform}
              onChange={(patch) => selectedSlot && onTransform(selectedSlot, patch)}
              onReset={() => selectedSlot && onResetTransform(selectedSlot)}
            />

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => selectedSlot && onRemoveSlot(selectedSlot)}
            >
              Figur entfernen
            </button>
          </>
        )}
      </section>

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
