/**
 * Ein Bild = ein Ort. Küche und Wohnzimmer sind zwei Räume,
 * nicht ein Hybrid aus Herd und Sitzkissen.
 */

export type FilmPlaceKey = 'kitchen' | 'living' | 'door' | 'street' | 'other'

const KITCHEN_RE =
  /küche|kueche|herd|spüle|spuele|teekessel|teekanne|teekrug|bereitet tee|tee vorbereit|wasserhahn|kitchen|füllt wasser|kessel pfeift|wasser läuft|eingieß|eingiess/
const LIVING_RE =
  /wohnzimmer|kissen|teppich|sofa|sessel|am boden|living room|gäste|sitzkreis|niedriger tisch|\bsalam\b|begrüß|begrüss/
const DOOR_RE = /klopf|klingel|wohnungstür|wohnungstuer|an der tür|an der tuer|flur|die tür füllt|die tuer fuellt/
const STREET_RE = /strasse|straße|street|draussen|draußen|hof|garten|park /

export function inferFilmPlaceKey(text: string): FilmPlaceKey {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return 'other'
  const kitchen = KITCHEN_RE.test(t)
  const living = LIVING_RE.test(t)
  const door = DOOR_RE.test(t)
  const street = STREET_RE.test(t)
  if (kitchen && !living && !street) return 'kitchen'
  if (living && !kitchen && !street) return 'living'
  if (door && !kitchen && !living) return 'door'
  if (street && !kitchen && !living) return 'street'
  if (kitchen && living) {
    if (
      /füllt|pfeift|eingieß|eingiess|teekessel|herd|spüle|bereitet tee|tee vorbereit/.test(t) &&
      !/salam|kissen|teppich/.test(t)
    ) {
      return 'kitchen'
    }
    if (
      /salam|kissen|teppich|gäste|sitzen/.test(t) &&
      !/teekessel|herd|füllt wasser|bereitet tee/.test(t)
    ) {
      return 'living'
    }
    return 'other'
  }
  if (door) return 'door'
  return 'other'
}

const PLACE_HINT_DE: Record<FilmPlaceKey, string> = {
  kitchen: 'Küche mit Herd und Teekessel — nicht das Wohnzimmer, keine Gäste am Boden',
  living: 'Wohnzimmer: Kissen und Teppich am Boden, Gäste sitzen — nicht die Küche, kein Herd',
  door: 'Wohnungstür und Flur von innen — nicht die Küche, nicht der Sitzkreis',
  street: 'Draussen vor dem Haus — nicht die Küche, nicht das Wohnzimmer',
  other: 'ein Raum, derselbe Ort wie in dieser Szene — nicht Küche und Wohnzimmer in einem Bild',
}

const PLACE_LABEL_DE: Record<FilmPlaceKey, string> = {
  kitchen: 'Küche',
  living: 'Wohnzimmer',
  door: 'Tür',
  street: 'Draussen',
  other: 'Ort',
}

const PLACE_LABEL_EN: Record<FilmPlaceKey, string> = {
  kitchen: 'kitchen',
  living: 'living room',
  door: 'hallway / door',
  street: 'outside',
  other: 'this one room',
}

export function placeLabelDe(key: FilmPlaceKey): string {
  return PLACE_LABEL_DE[key]
}

export function placeLabelEn(key: FilmPlaceKey): string {
  return PLACE_LABEL_EN[key]
}

export function settingHintForPlace(key: FilmPlaceKey): string {
  return PLACE_HINT_DE[key]
}

/** Kurzer Ort für die Bild-KI — niemals der ganze Film-Prompt. */
export function inferSettingHintDe(text: string, fallback?: string): string {
  const key = inferFilmPlaceKey(text)
  if (key === 'kitchen' || key === 'living' || key === 'door') return settingHintForPlace(key)
  const short = (fallback || '').trim().replace(/\s+/g, ' ')
  if (short && short.length < 90 && !/\n/.test(short)) {
    const fromFallback = inferFilmPlaceKey(short)
    if (fromFallback === 'kitchen' || fromFallback === 'living' || fromFallback === 'door') {
      return settingHintForPlace(fromFallback)
    }
    return short
  }
  return PLACE_HINT_DE.other
}

export function placeLockEn(key: FilmPlaceKey): string {
  if (key === 'kitchen') {
    return (
      'PLACE LOCK: THIS frame is the KITCHEN only (stove, kettle, sink). ' +
      'PROP LOCK: the SAME kettle (shape, color, handle) and the SAME stove type as in the attached previous kitchen photo — gas stays gas, induction stays induction. ' +
      'Fill the kettle with water at the sink BEFORE it sits on the stove. Never put an empty kettle on the hob. ' +
      'FORBIDDEN: a new kettle every frame, swapping gas for induction, living-room cushions, guests sitting on the floor, mixing both rooms.'
    )
  }
  if (key === 'living') {
    return 'PLACE LOCK: THIS frame is the LIVING ROOM only (cushions, rug, low table, seated guests). FORBIDDEN: kitchen cabinets, stove, sink, mixing both rooms.'
  }
  if (key === 'door') {
    return 'PLACE LOCK: THIS frame is the DOOR / hall. FORBIDDEN: the kitchen, the seated gathering.'
  }
  if (key === 'street') {
    return 'PLACE LOCK: THIS frame is OUTSIDE. FORBIDDEN: kitchen or living room furniture.'
  }
  return 'PLACE LOCK: One room only. Never collage kitchen and living room into one picture.'
}
