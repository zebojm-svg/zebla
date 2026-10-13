import type { ReactNode } from 'react'
import type { BirkenbihlWord, DialogLineKind } from '../types'
import { isRtlLanguage, languageName } from '../types'

export function nativeLayerLabel(sourceLanguage?: string): string {
  if (!sourceLanguage || sourceLanguage === 'de') return 'Deutsch'
  return languageName(sourceLanguage)
}

export function targetLayerLabel(_targetLanguage?: string): string {
  return 'Zielsprache'
}

export function LineLanguageLayers({
  nativeText,
  targetText,
  birkenbihl,
  targetLanguage,
  sourceLanguage,
  showRomanization = true,
  kind,
  speaker,
  nativeSlot,
  missingNativeHint,
  missingTargetHint,
}: {
  nativeText?: string
  targetText?: string
  birkenbihl?: BirkenbihlWord[]
  targetLanguage?: string
  sourceLanguage?: string
  showRomanization?: boolean
  kind?: DialogLineKind
  speaker?: string
  nativeSlot?: ReactNode
  missingNativeHint?: string
  missingTargetHint?: string
}) {
  const native = (nativeText || '').trim()
  const target = (targetText || '').trim()
  const speech = kind !== 'action'
  const words = speech
    ? (birkenbihl ?? []).filter((w) => w.text?.trim() || w.translation?.trim())
    : []
  const roman = showRomanization
    ? words
        .map((w) => w.romanization?.trim())
        .filter(Boolean)
        .join(' ')
    : ''
  const targetRtl = targetLanguage ? isRtlLanguage(targetLanguage) : false
  const nativeRtl = sourceLanguage ? isRtlLanguage(sourceLanguage) : false

  return (
    <div className="line-lang-layers">
      {speaker ? <p className="film-beat-speaker">{speaker}</p> : null}

      <div className="line-lang-block">
        <p className="line-lang-label">{nativeLayerLabel(sourceLanguage)}</p>
        {nativeSlot ??
          (native ? (
            <p
              className="line-lang-text"
              lang={sourceLanguage || 'de'}
              dir={nativeRtl ? 'rtl' : undefined}
            >
              {native}
            </p>
          ) : (
            <p className="muted line-lang-text">
              {missingNativeHint || 'Noch kein Deutsch — «Deutsch unter die Zeilen».'}
            </p>
          ))}
      </div>

      {speech ? (
        <>
          <div className="line-lang-block">
            <p className="line-lang-label">{targetLayerLabel(targetLanguage)}</p>
            {target ? (
              <p
                className="line-lang-text"
                dir={targetRtl ? 'rtl' : undefined}
                lang={targetLanguage}
              >
                {target}
              </p>
            ) : (
              <p className="muted line-lang-text">
                {missingTargetHint || 'Noch keine Zielsprache — «Zielsprache machen».'}
              </p>
            )}
          </div>

          <div className="line-lang-block">
            <p className="line-lang-label">Birkenbihl</p>
            {words.length ? (
              <div
                className={`birkenbihl-line ${targetRtl ? 'birkenbihl-line--rtl' : ''}`}
                dir={targetRtl ? 'rtl' : 'ltr'}
                lang={targetLanguage}
              >
                <div className="birkenbihl-words">
                  {words.map((w, i) => (
                    <span key={i} className="birkenbihl-word">
                      {w.text ? <span className="birkenbihl-top">{w.text}</span> : null}
                      {w.translation ? (
                        <span className="birkenbihl-bottom" lang={sourceLanguage || 'de'}>
                          {w.translation}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted line-lang-text">
                {target
                  ? 'Noch kein Birkenbihl — «Deutsch unter die Zeilen».'
                  : 'Birkenbihl kommt mit der Zielsprache.'}
              </p>
            )}
          </div>

          {roman ? (
            <div className="line-lang-block">
              <p className="line-lang-label">Lautschrift</p>
              <p className="line-lang-text line-lang-roman" lang="de">
                {roman}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
