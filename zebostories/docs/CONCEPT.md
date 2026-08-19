# ZeboStories — Konzept & Architektur

## Kernidee

On-Demand wachsende Asset-Bibliothek. Jede Figur und jedes Umfeld wird **einmal** per KI generiert
und danach unbegrenzt wiederverwendet — ohne neue Rechenkosten.

## Asset-Typen

### 1. Charakter (Figur)

Ein Charakter besteht aus **Ebenen** (Layers), nicht aus einem flachen Bild:

```
character/
├── meta.yaml           # Name, Beschreibung, Stil, Erstellungsdatum
├── body/
│   ├── front.png       # Ganzkörper frontal (freigestellt, transparent)
│   ├── side.png        # Seitenansicht
│   └── back.png        # Rückenansicht
├── head/
│   ├── neutral.png
│   ├── happy.png
│   ├── sad.png
│   ├── surprised.png
│   └── angry.png
├── arms/
│   ├── resting.png
│   ├── gesturing.png
│   ├── pointing.png
│   └── crossed.png
├── legs/
│   ├── standing.png
│   ├── sitting.png
│   ├── walking-1.png
│   ├── walking-2.png
│   └── swimming.png   # nur Oberkörper sichtbar
└── animations/
    ├── blink.json      # Timing + Frame-Referenzen
    ├── talk.json       # Mund-Frames für Lipsync
    └── hair-wind.json  # Haar-Overlay-Frames
```

### 2. Umfeld (Environment)

```
environment/
├── meta.yaml           # Name, Kategorie, Lichtrichtung, Perspektive
├── background.png      # Haupthintergrund (z.B. 1920×1080)
├── foreground.png      # Vordergrund-Elemente (optional, z.B. Tischkante)
├── zones.json          # Wo dürfen Figuren platziert werden?
│                       # [{ id: "couch", x: 200, y: 400, scale: 0.8, pose: "sitzen" }]
└── masks/
    └── water.png       # Maske: was verdeckt wird (z.B. Wasser ab Hüfte)
```

### 3. Pose

Wiederverwendbare Körperstellung — nicht figurenspezifisch, sondern übertragbar:

```yaml
# poses/sitzen/meta.yaml
name: sitzen
armPosition: resting
legPosition: sitting
torsoAngle: 0
description: "Figur sitzt aufrecht"
compatibleZones: [couch, chair, bench, ground]
```

### 4. Animation

Sprite-basiert, kein Video:

```yaml
# animations/blinzeln/meta.yaml
name: blinzeln
fps: 12
loop: true
interval: [3000, 6000]  # ms zwischen Blinzlern (zufällig)
frames:
  - eyes-open.png       # 1 Frame
  - eyes-half.png       # 1 Frame
  - eyes-closed.png     # 2 Frames
  - eyes-half.png       # 1 Frame
  - eyes-open.png       # zurück
```

## Compositing-Pipeline (pro Szene, 0 KI-Kosten)

```
1. Hintergrund laden (environment/background.png)
2. Für jede Figur in der Szene:
   a. Körper-Layer gemäß Pose zusammensetzen
   b. Kopf/Ausdruck wählen
   c. Arm-Position wählen
   d. An Zone platzieren (position, scale aus zones.json)
   e. Maske anwenden (z.B. Wasser verdeckt Beine)
3. Vordergrund-Layer darüber
4. Animation-Loops starten (Blinzeln, Mund, Haare)
```

## On-Demand-Generierung (nur wenn Asset fehlt)

Wenn der Nutzer z.B. „einen Astronauten" braucht:

1. Prompt generieren (aus Stil-Template + Beschreibung)
2. Bild-KI generiert: Ganzkörper, freigestellt
3. KI zerlegt in Ebenen (Kopf, Arme, Beine) oder: wir generieren jede Ebene separat
4. Verschiedene Gesichtsausdrücke generieren (Inpainting nur Gesicht = billig)
5. Asset in Bibliothek speichern
6. Ab jetzt: 0 Kosten für diese Figur

**Kosten pro neue Figur**: ~8–12 Bild-Generierungen × ~3–5 Cent = 30–60 Cent

## Offene Fragen

- [ ] Welche Bild-KI eignet sich am besten für konsistente Ebenen? (Flux > DALL-E für Transparenz)
- [ ] Automatische Ebenen-Zerlegung vs. manuelle Separation?
- [ ] Wie viele Posen pro Figur sind das Minimum für gute Stories? (Schätzung: 5–8)
- [ ] Lipsync: Phonem-basiert oder einfach Amplitude?
- [ ] Stil-Konsistenz: LoRA/IP-Adapter pro Stil oder reicht guter Prompt?

## Spätere Features (nicht für v1)

- Kamera-Bewegung (Pan, Zoom auf Canvas)
- Parallax-Scrolling bei Hintergrund-Ebenen
- Export als Video (ffmpeg aus Canvas-Frames)
- Kollaborative Bibliothek (Klasse teilt sich Figuren-Pool)
- KI-generierte Story-Vorschläge basierend auf vorhandenen Assets
