# Zebla — Stadtplan

Lebende Notiz für Mensch und Cursor. Kurz, damit man beim nächsten Mal nicht den Park mit der Stadt verwechselt. Jean-Marie redet normal; Cursor hält das hier aktuell.

## Betroffene App

Nur **Zebla** (`zebojm-svg/zebla`, live [zebla.zebotools.ch](https://zebla.zebotools.ch)). Hub, PortFolio, Examinator, Zentrale bleiben unberührt.

**Mensch:** Jean-Marie, kein Programmierer. UI auf Deutsch, einfach.

Nur **eigene Figuren**, keine Petit-Nicolas-Kopien in der App. Petit Nicolas darf als **Unterrichts-Video** (YouTube) vorkommen — das ist Examinator/Unterricht, nicht der Film-Generator.

## So ist die Stadt gebaut

1. **Geschichte = Ordner.** Dialog, Skript (Film-Prompt), Storyboard, Film und Diashow liegen zusammen. Neue Geschichte legt den Ordner selbst an.
2. **Welt-Regal** (`/library`): Figuren, Räume, Möbel, Skizzen — über allen Geschichten. Zeichnen nur, wenn etwas fehlt. Gleiche Person (Ramo 1 / Ramo 2) bleibt getrennt; Ernten aus einem Standbild ist kein zweites Gesicht.
3. **Meta-Blatt** auf der Dialog-Seite: wer spielt, Stimmen, Räume, Licht/Blick. Gilt für die ganze Geschichte.
4. **Standbilder zuerst.** Ein Bild je Dialogzeile. Die erste Zeile einer Szene ist das **Grundbild** (ganzer Raum, wer wo sitzt, wer wen anschaut). Die nächsten Zeilen nehmen dasselbe Bild, bis man unter «Bild ändern» etwas **neu malt**. Das Tool schickt der KI immer dieses Foto plus Sitzplan, Blick und wer-wer-ist — Jean-Marie schreibt nur den kurzen Hinweis («Schöme ist ein Mann»). Nahaufnahme = Zoom in dieselbe Übersicht, nicht ein neues Porträt. Das dauert etwa eine Minute. Zwischenbilder (Klingeln, zur Tür) kann man einfügen. Laufen durchs Bild kommt später. Beim Abspielen: eine Zeile nach der anderen mit Deutsch darunter, leise Hintergrundmusik.
5. **Diashow** bleibt die Lernansicht derselben Geschichte, kein zweites Produkt.
6. **Figuren stellen ohne KI.** Nach dem Ernten: ziehen und zoomen auf Film/Storyboard. Die Lage bleibt gespeichert.
7. **Freisteller sitzen im Raum.** Kontakt-Schatten unter den Figuren. In der Vorschau leichtes Atmen und Blinzeln (noch keine Lippen).
8. **Möbel-Ernte.** Stuhl, Bank, Tisch, Rolltreppe usw. aus dem Bildtext — nach der Szene ins Welt-Regal.

Teure Bewegung (sprechen/laufen als Film) **erst** wenn Board und Stil stimmen.

## Wie Zebla eine Geschichte zusammenhält

Drei Schichten. Prompts allein reichen nicht.

1. **KI malt und spricht.** Gemini (Bilder), Übersetzen, Stimmen, Musik. Jeder Aufruf kann neu erfinden: anderes Wohnzimmer, anderes Schwimmbad, anderes Gesicht.
2. **Logik um die KI.** Das Tool formuliert den Prompt, hängt Sitzplan, Blick und «wer wer ist» an. Das ist ein Wunschzettel. Hilft, ist aber kein Schloss.
3. **Dasselbe Bild wiederverwenden.** Pro Szene ein **Grundbild** (erster weiter Shot dieses Orts). Weitere Zeilen = dasselbe Foto, bis etwas geändert wird. Nahaufnahme = Zoom in dieses Foto, kein neues Porträt. Welt-Regal hält Gesichter. Das hält Wohnzimmer und Schwimmbad gleich: neuer Ort = neues Grundbild, nicht «nochmal Schwimmbad malen».

Ton und Stimmen laufen auf einer zweiten Spur (Text → Sprache). Die bleiben konsistent über Sprecher-Profile, nicht über das Bild.

**Nächster harter Schritt (noch nicht):** Wenn die Kamera wirklich woanders steht (andere Beckenseite), braucht es ein zweites Grundbild oder echten Schnitt — nicht «Gemini, male das Becken von links».

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

## Stand (2026-10)

**Live (main):** Projektordner, Welt-Regal, Meta-Blatt, Szene-für-Szene-Standbilder, «Bild neu malen», Figuren ziehen/zoomen, Schatten und Blinzeln, Möbel-Ernte, Bibliothek löschen, Deutsch unter den Zeilen.

**In Arbeit:** Grundbild gilt für jeden Ort (Wohnzimmer, Schwimmbad, Park). Prompts sagen nicht mehr automatisch «Tisch». Nahaufnahme ist Zoom in denselben Ort.

**Nächste Baustellen (noch nicht hier):**

- Klingeln und Schritte im Ton
- Figur läuft / schiebt sich durchs Bild
- Lippenbewegung zur Stimme
- Schatten weicher / lichtabhängig
- Möbel in der Szene selbst verschieben wie Figuren

**Offen, bewusst später:** echter Bewegungsfilm.

## Wie Jean-Marie redet

«Mach das live», «wo klicke ich», «das Bild stimmt nicht, der Prospekt fehlt». Kein Pflichtenheft nötig. Cursor übersetzt in Code und schreibt Änderungen **hierher** zurück.
