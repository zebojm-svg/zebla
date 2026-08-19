# ZeboStories — Konzept & Architektur (v2)

## Vision

Zebla wird erweitert: neben Sprachdialogen auch **animierte Bildergeschichten** mit
wiederverwendbaren Figuren, Props und Umfeldern. Alles compositing-basiert — KI-Kosten
fallen nur beim ersten Erstellen eines Assets an, nie beim Abspielen.

---

## Zwei Modi im selben Tool

| Modus | Beschreibung |
|-------|-------------|
| **Dialog** | 2+ Figuren reden abwechselnd, Birkenbihl-Übersetzung, TTS |
| **Story** | Timeline mit Szenen, stille Momente, Wetter, Figuren bewegen sich |

Beide teilen dieselbe Asset-Bibliothek und denselben Compositing-Engine.

---

## Asset-Hierarchie (skalierbar auf 1000+ Elemente)

### Prinzip: Tags + Presets + Einzelteile

```
Asset-Typen:
┌─────────────────────────────────────────────────────────┐
│  Szenen-Preset   (= vorgefertigte Kombination)          │
│    "Gedeckter Tisch" = Tisch + 4 Teller + 4 Gläser     │
│    "Schwimmbad"      = Becken + Liegestühle + Schirme   │
├─────────────────────────────────────────────────────────┤
│  Umfeld (Environment)                                   │
│    Hintergrund + Vordergrund + Zonen + Masken           │
├─────────────────────────────────────────────────────────┤
│  Charakter (Character)                                  │
│    Körper-Ebenen + Kopf + Arme + Beine + Mimik          │
├─────────────────────────────────────────────────────────┤
│  Props (Einzelobjekte)                                  │
│    Teller, Stuhl, Regenschirm, Ball, Buch, Lampe…       │
├─────────────────────────────────────────────────────────┤
│  Effekte (Overlays)                                     │
│    Regen, Schnee, Nebel, Sonnenstrahlen, Nacht          │
└─────────────────────────────────────────────────────────┘
```

### Warum Tags statt nur Ordner?

Bei 1000 Elementen findet man nichts mehr in Ordnern allein.
Jedes Asset bekommt **Tags**, die Suche und Filter ermöglichen:

```yaml
# Beispiel: ein Teller
id: prop-teller-blau
name: "Blauer Teller"
type: prop
tags: [geschirr, küche, essen, blau, rund]
style: comic
size: { w: 80, h: 80 }
anchor: { x: 40, y: 40 }  # Mittelpunkt für Platzierung
stackable: true             # darf mehrfach in Szene
```

### Suche im Editor:

```
Nutzer tippt: "teller"
→ Zeigt: Blauer Teller, Weißer Teller, Suppenteller, Teller mit Essen…

Nutzer tippt: "küche möbel"
→ Zeigt: Tisch, Stuhl, Kühlschrank, Herd, Regal…

Nutzer tippt: "schwimmbad"
→ Zeigt: Szenen-Preset "Schwimmbad" + Einzelteile (Becken, Liegestuhl, Handtuch…)
```

---

## Charakter-Aufbau (Layer-System)

Jede Figur = zusammengesetztes Puppet aus Ebenen:

```
Character "Thomas":
├── body/           # Torso (verschiedene Kleidungen möglich)
├── head/           # Kopfformen + Frisuren
│   ├── expressions/    # Mimik: neutral, happy, sad, angry, surprised…
│   └── mouth/          # Mundformen für Lipsync (A, O, E, closed, smile)
├── arms/           # Armpositionen
│   ├── resting.png
│   ├── gesturing.png
│   ├── holding-left.png   # hält etwas in der Hand
│   └── swimming.png
├── legs/           # Beinpositionen
│   ├── standing.png
│   ├── sitting.png
│   ├── walking/    # 4-6 Walk-Cycle-Frames
│   └── hidden.png  # für "im Wasser" (leer)
└── accessories/    # Optional: Brille, Hut, Tasche…
```

### Posen als Rezepte (nicht neue Bilder):

```yaml
# pose: "am-tisch-sitzen"
body: front
head: neutral         # überschreibbar durch Szene
arms: resting
legs: sitting
position: zone.chair  # an die Stuhl-Zone im Umfeld andocken
```

---

## Szenen-Presets (Übersichtlichkeit bei vielen Elementen)

Ein Preset = fertige Bühne, die der Nutzer in 1 Klick laden und dann anpassen kann:

```yaml
# presets/abendessen.yaml
name: "Abendessen am Küchentisch"
environment: drinnen/küche
props:
  - id: tisch-gross
    position: { x: 50, y: 65 }
  - id: stuhl
    position: { x: 30, y: 70 }
    repeat: 4
    spacing: 15
  - id: teller-weiss
    position: { x: 30, y: 60 }
    repeat: 4
    spacing: 15
  - id: glas
    position: { x: 33, y: 58 }
    repeat: 4
    spacing: 15
zones:
  - id: seat-1
    position: { x: 30, y: 68 }
    pose: sitzen
  - id: seat-2
    position: { x: 45, y: 68 }
    pose: sitzen
  - id: seat-3
    position: { x: 60, y: 68 }
    pose: sitzen
  - id: seat-4
    position: { x: 75, y: 68 }
    pose: sitzen
```

Nutzer wählt "Abendessen" → alles ist da. Will er 6 Teller? Zieht Props dazu.

---

## Timeline & stille Momente

Nicht jede Szene hat sofort Dialog. Eine Story hat eine Timeline:

```yaml
timeline:
  - at: 0s
    action: dialog
    speaker: kevin
    text: "Ich gehe mal kurz ans Fenster."

  - at: 2s
    action: animate
    target: kevin
    animation: walk
    to: zone.fenster
    duration: 3s

  - at: 5s
    action: pose-change
    target: kevin
    pose: stehen-am-fenster
    expression: nachdenklich

  - at: 6s
    action: effect
    type: regen
    intensity: light
    fade-in: 2s

  - at: 8s
    action: dialog
    speaker: kevin
    text: "Es fängt an zu regnen…"
    expression: überrascht

  - at: 10s
    action: environment-transition
    from: drinnen/wohnzimmer
    to: drinnen/wohnzimmer-dunkel
    duration: 3s
```

### KI-Vorschlag-System:

Nutzer gibt Dialogtext ein → KI analysiert und schlägt Timeline vor:

```
Input:  "Kevin steht auf und geht zum Fenster. Es fängt an zu regnen."

KI-Vorschlag:
  1. kevin: animation walk → zone.fenster (3s)
  2. kevin: pose stehen-am-fenster, expression nachdenklich
  3. effect: regen, light, fade-in 2s
  4. [optional] hintergrund abdunkeln

Nutzer: ✓ Annehmen / ✏️ Anpassen / ✗ Verwerfen
```

---

## Skalierbarkeit: Wie bleibt es übersichtlich bei 1000+ Assets?

### 1. Intelligente Suche (nicht nur Ordner)

```
Suche: fuzzy-match auf Name + Tags + Beschreibung
Filter: Typ (character/prop/environment/effect), Stil, Farbe, Größe
Favoriten: oft benutzte Assets oben anpinnen
Zuletzt verwendet: die letzten 20 Assets griffbereit
```

### 2. Kategorien als flache Tags (nicht tiefe Bäume)

```
Statt:  Drinnen > Küche > Möbel > Tisch > Esstisch
Besser: Tags: [drinnen, küche, möbel, tisch, gross]
```

→ Ein Asset kann in mehreren Kontexten auftauchen (Tisch passt in Küche UND Wohnzimmer).

### 3. Szenen-Presets als Abkürzung

Nutzer muss nicht 30 Props einzeln platzieren.
"Restaurant" → Preset lädt alles → Nutzer passt an.

### 4. Stil-Gruppen

Alle Assets eines Stils gehören zusammen. Filter: „nur Comic-Stil" → sieht nur passende Assets.

---

## On-Demand Asset-Generierung

Wenn etwas fehlt:

```
Nutzer: "Ich brauche einen Hund"

System:
  1. Suche in Bibliothek → kein Hund vorhanden
  2. Dialog: "Soll ich einen Hund generieren? Welcher Stil? Welche Rasse?"
  3. Nutzer: "Golden Retriever, Comic-Stil"
  4. KI generiert:
     - Hund stehend (freigestellt)
     - Hund sitzend
     - Hund liegend
     - Hund laufend (3 Frames)
     - Kopf: fröhlich, traurig, aufmerksam
  5. → Gespeichert als character/tiere/golden-retriever/
  6. Ab jetzt: 0 Kosten, immer verfügbar
```

Geschätzter Aufwand pro neuem Asset:
- Einfaches Prop (Teller, Ball): 1 Generation = ~3–5 Cent
- Charakter (alle Posen + Mimik): 8–12 Generationen = ~30–60 Cent
- Umfeld (Hintergrund + Vordergrund + Zonen): 2–3 Generationen = ~10–15 Cent

---

## Integration mit bestehendem Zebla

```
Zebla (heute):
  Dialog erstellen → Birkenbihl → TTS → Diashow (statische Bilder)

Zebla (erweitert):
  Dialog erstellen → Birkenbihl → TTS → Story-Modus:
    - Figuren aus Bibliothek wählen
    - Umfeld wählen
    - KI schlägt Szenen-Aufbau vor
    - Compositing-Engine zeigt animierte Szenen
    - Lipsync zu TTS-Audio
    - Stille Momente zwischen Dialogzeilen
```

---

## Offene Entscheidungen

1. **Wo leben die Assets?** Firebase Storage (wie heute) oder Cloudflare R2 (billiger bei viel Traffic)?
2. **Canvas-Lib?** Pixi.js (performant, Sprites) vs. Konva (einfacher, DOM-nah)?
3. **Asset-Editor im Tool?** Oder nur Upload + Tag-Vergabe?
4. **Figuren-Zerlegung**: KI macht das automatisch (SAM-Segmentierung) oder manuell vorbereiten?
5. **Stil-Konsistenz**: Alle Assets im selben Prompt-Template generieren, oder LoRA/IP-Adapter?
