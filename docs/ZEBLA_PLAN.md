# Zebla Story — Grobplan

Lebende Notiz für Mensch und Cursor. Jean-Marie redet normal; Cursor hält das hier aktuell.

**App:** nur Zebla Story (`zebojm-svg/zebla`, live [zebla.zebotools.ch](https://zebla.zebotools.ch)). Hub / PortFolio / Examinator extra.

**Mensch:** Jean-Marie, kein Programmierer. UI auf Deutsch, einfach.

## Was das Produkt ist

Stills-first Filmstudio (nicht Pose-Räder als Hauptweg):

1. **Dialog** — ein Fenster «Dein Film» (Text + Bild/Ton-Hinweise). Titel jederzeit. Speichert mit.
2. **Storyboard** — Kästen, Szenen, Bibliothek zuerst (Posen/Orte wiederverwenden).
3. **Bibliothek** — Figuren (einzeln, auch bei Überlappung) und Hintergründe getrennt. Sonst wird jedes Bild ultra teuer.
4. **Film** — Stil/Sprache, **Szene für Szene Standbilder**, Dialog unter dem Bild, Szene anhören (Stimme, noch kein Bewegungsfilm).

Teure Bewegung (sprechen/blinzeln/laufen als Film) **erst** wenn Board und Stil stimmen.

Nur **eigene Figuren**, keine Petit-Nicolas-Kopien in der App. Petit Nicolas darf als **Unterrichts-Video** (YouTube) vorkommen — das ist Examinator/Unterricht, nicht der Film-Generator.

## Design (die «gleiche Holzart»)

Schon in `src/index.css` `:root`:

- Akzent teal `#0d9488` (wie Hub-Zebla)
- Radius 16 / 10 / Pille
- Fläche weiss, Hintergrund `#f6f7fb`, Text grau/dunkel
- Gefahr rot, Warnung gelb

Neue Screens: diese Variablen nutzen, nicht neue Paletten.

## Geld / Kontingent (wo nachschauen)

| Was | Wo |
|---|---|
| Cursor-Tokens | [cursor.com/dashboard/spending](https://cursor.com/dashboard/spending) |
| Standbilder (aktuell Gemini) | [Google AI Studio](https://aistudio.google.com) → Usage / Billing |
| FLUX-Reserve | [Replicate Billing](https://replicate.com/account/billing) (Guthaben kann unberührt sein, wenn Gemini malt) |
| Live/Deploy | [Vercel Zebla](https://vercel.com/zebojm-svgs-projects/zebla) |
| Zebla intern | App oben **Pro** (Master = fast kein Limit) |

## Stand (2026-09)

**Live (main):** Szene-für-Szene-Standbilder, Autosave + Titel + Löschen, Dialog unter Bildern, Szene abspielen, Zerlegen in Bibliothek.

**Nicht live / als Nächstes merken:**

- Figuren auf dem Standbild **ziehen/zoomen ohne KI** (Rolltreppe-Beispiel) — Branch/PR stellen.
- Leise Szenenmusik + Stimme-Anzeige (KI vs Browser) + Pro-Links.

**Offen, bewusst später:** echter Bewegungsfilm.

## Wie Jean-Marie redet

«Mach das live», «wo klicke ich», «das Bild stimmt nicht, der Prospekt fehlt». Kein Pflichtenheft nötig. Cursor übersetzt in Code und schreibt Änderungen **hierher** zurück.
