# ZeboStories

Animierte Bildergeschichten mit wiederverwendbaren Figuren, Umfeldern und Sprite-Animationen.

## Konzept

Statt für jede Szene ein komplett neues Bild per KI zu generieren, arbeitet ZeboStories mit einer **wachsenden Asset-Bibliothek**:

1. **Figuren** (Characters) — einmal generiert als Ebenen-Set (Körper, Kopf, Arme, Beine, Gesichtsausdrücke, Posen)
2. **Umfelder** (Environments) — Hintergründe mit Metadaten (Lichtrichtung, Perspektive, Platzierungszonen)
3. **Posen & Tätigkeiten** — sitzen, stehen, gehen, schwimmen, gestikulieren… pro Figur gespeichert
4. **Animationen** — Sprite-Frames für Blinzeln, Mund (Lipsync), Haare im Wind, Armbewegung

### Kostenmodell

| Aktion | KI-Kosten | Häufigkeit |
|--------|-----------|------------|
| Neue Figur generieren (alle Posen + Mimik) | ~30–50 Cent | 1× pro Figur |
| Neues Umfeld | ~5 Cent | 1× pro Ort |
| Szene zusammenbauen (Compositing) | 0 | Jede Szene |
| Animation abspielen | 0 | Immer |
| Neue Pose nachgenerieren | ~5 Cent | Selten |

## Bibliothek-Struktur

```
library/
├── characters/          # Figuren
│   ├── mann/
│   │   ├── fussballer/
│   │   ├── thomas/
│   │   └── kevin/
│   ├── frau/
│   └── kind/
├── environments/        # Umfelder
│   ├── draussen/
│   │   ├── fussballplatz/
│   │   └── schwimmbad/
│   └── drinnen/
│       ├── wohnzimmer/
│       ├── kinderzimmer/
│       └── museum/
├── poses/               # Wiederverwendbare Posen
│   ├── sitzen/
│   ├── stehen/
│   ├── gehen/
│   ├── schwimmen/
│   └── gestikulieren/
├── animations/          # Sprite-Frames
│   ├── blinzeln/
│   ├── mund/
│   ├── haare-wind/
│   └── arm-bewegung/
└── styles/              # Stil-Templates
    ├── comic/
    ├── kinderbuch/
    └── anime/
```

## Szenen-Beschreibung (Beispiel)

```yaml
scene:
  environment: schwimmbad/liegewiese
  characters:
    - id: thomas
      pose: liegen
      position: { x: 30, y: 70 }
      expression: entspannt
      animation: haare-wind
    - id: kevin
      pose: liegen
      position: { x: 60, y: 70 }
      expression: lachend
      animation: blinzeln
  text: "Thomas und Kevin liegen auf der Liegewiese."
```

## Architektur

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Szenen-    │     │  Compositing │     │  Animation-     │
│  Editor     │────▶│  Engine      │────▶│  Player         │
│  (UI)       │     │  (Canvas)    │     │  (Sprite-Loop)  │
└─────────────┘     └──────────────┘     └─────────────────┘
       │                    │
       ▼                    ▼
┌─────────────┐     ┌──────────────┐
│  Asset-     │     │  KI-Gen      │
│  Bibliothek │◀────│  (on-demand) │
│  (Storage)  │     │  Imagen/Flux │
└─────────────┘     └──────────────┘
```

## Tech-Stack (geplant)

- **Frontend**: React + Canvas/WebGL (Pixi.js oder Konva)
- **Asset-Generierung**: Gemini Imagen / Flux / DALL-E (einmalig pro Asset)
- **Compositing**: Client-seitig (keine Server-Kosten pro Szene)
- **Animation**: Sprite-Sheet + requestAnimationFrame
- **Lipsync**: Timing aus Audio-Waveform (Amplitude → Mundform)
- **Storage**: Firebase Storage (wie Zebla) oder Cloudflare R2

## Status

🚧 Konzeptphase — Bibliothek-Struktur und Asset-Format werden definiert.
