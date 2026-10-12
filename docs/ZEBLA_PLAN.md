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
4. **Standbilder zuerst.** Ein Bild je Zeile. Die Kamera trifft Regie-Entscheidungen — nicht immer der ganze Raum. Erstes Sprechen in einer Szene = **Grundbild** (wer wo sitzt). Wenn jemand spricht = **Nahaufnahme** dieser Person. Handlung dazwischen (Tee, Klopfen, Tür) = **Zwischenbild** (Insert), neues Standbild, nicht das Wohnzimmer kopieren. Nahaufnahme = **Kamera wechselt den Platz** (FLUX Kontext auf das Grundbild): man schaut der Person ins Gesicht. Gemini dreht nur den Kopf — deshalb nicht für Nahaufnahmen. Weit-Bilder bleiben Gemini. Laufen durchs Bild kommt später.
   **Dialog darf mehr als Dialog sein.** Zeilenart: Dialog / Handlung / Erzähler. Handlung ist still (Bild + Pause). Erzähler wird gesprochen. Beispiel: «Ramo bereitet Tee vor…» → Zwischenbild Tee; «Da klopft es an der Tür» → Kamera auf die Tür; dann Salam als Weit, dann Nahaufnahme wer spricht.
   **Szenen im Dialog, nicht auf dem Board.** «Dialog daraus machen» teilt den Prompt in Szenen mit Handlung und eigenem gesprochenen Text. Das Board malt nur diese Szenen — keine Extra-Szenen einfügen, keinen Dialog dort nachschreiben. Kopierter Dialog wird verworfen.
   **Board-Zeile (Lesen zuerst):** Bild | Zielsprache, darunter normale deutsche Übersetzung (keine Birkenbihl-Wortfolge; Namen lateinisch: Ramo, Ubai, Schöme). Bild ändern unter dem Bild. Kamera/Sitzplan/Skizze hinter **Regie**. Stimmen jederzeit über «Stimmen anpassen». Beim Abspielen: jedes gemalte Bild der Reihe nach — Zwischenbilder still, dann wer spricht. Die Zeilen kommen vom Bild (lineIds) oder vom Szenentitel, nicht nur von einer Abschnitts-Id (Gemini schreibt oft «1»). Stimme als lokale Datei; Probesatz und Stimme wählen pro Figur. Bekannte Jungennamen bleiben männlich. Ton: leise persische KI-Musik (Lyria, Loop; kein Game-Boy-Piepsen, kein Stadtbrummen), ab und zu ein Nuss-Knacken.
5. **Diashow** bleibt die Lernansicht derselben Geschichte, kein zweites Produkt.
6. **Figuren stellen ohne KI.** Nach dem Ernten: ziehen und zoomen auf Film/Storyboard. Die Lage bleibt gespeichert.
7. **Freisteller sitzen im Raum.** Kontakt-Schatten unter den Figuren. In der Vorschau leichtes Atmen und Blinzeln (noch keine Lippen).
8. **Möbel-Ernte.** Stuhl, Bank, Tisch, Rolltreppe usw. aus dem Bildtext — nach der Szene ins Welt-Regal.

Teure Bewegung (sprechen/laufen als Film) **erst** wenn Board und Stil stimmen.

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
| Live/Deploy | [Vercel Zebla](https://vercel.com/zebojm-svgs-projects/zebla) · Anmeldung nur auf [zebla.zebotools.ch](https://zebla.zebotools.ch) — Vercel-Git-Vorschau (`…-git-….vercel.app`) darf Google nicht |
| Zebla intern | App oben **Pro** (Master = fast kein Limit) |

## Stand (2026-10)

**Live (main):** Projektordner, Welt-Regal, Meta-Blatt, Szene-für-Szene-Standbilder, «Bild neu malen», Figuren ziehen/zoomen, Schatten und Blinzeln, Möbel-Ernte, Bibliothek löschen, Deutsch unter den Zeilen, Szene abspielen mit Stimme, Board als Comic-Zeile, KI-Musik (Lyria), Szenen nur im Dialog aus dem Prompt, Kamera-Regie (Nahaufnahme wer spricht, Zwischenbilder, Handlung/Erzähler im Dialog).

**In Arbeit:** —

**Nächste Baustellen (noch nicht hier):**

- Figur läuft / schiebt sich durchs Bild — **erst** wenn Board, Dialog und Stimmen stimmen
- Lippenbewegung zur Stimme
- Schatten weicher / lichtabhängig
- Möbel in der Szene selbst verschieben wie Figuren

**Offen, bewusst später:** echter Bewegungsfilm.

## Wie Jean-Marie redet

«Mach das live», «wo klicke ich», «das Bild stimmt nicht, der Prospekt fehlt». Kein Pflichtenheft nötig. Cursor übersetzt in Code und schreibt Änderungen **hierher** zurück.

## Wie wir mit Cursor arbeiten

Jean-Marie muss nicht im Voraus wissen, was er will. Ein Satz plus Screenshot reicht. Nachschauen, dann korrigieren («nein, Kamera näher, kein Ausschnitt») ist der normale Weg.

- **Ein Gespräch**, nicht fünf Agents. Mehrere Agents nur bei zwei fertigen, unabhängigen Aufträgen. Umdenken bleibt im selben Chat.
- **Dieser Stadtplan** ist die Ideendatei. Keine Extra-Dokumente «für später».
- **Cloud-Agent** (läuft im Hintergrund, macht einen Vorschlag zum Mergen): gut für «das Bild stimmt nicht» / «mach das so». Nicht für stundenlanges Suchen ohne Ziel.
- **Live-Test** nach dem Merge auf [zebla.zebotools.ch](https://zebla.zebotools.ch). Git-Vorschau: Google-Login geht nicht.
- **Nicht mergen**, bis Jean-Marie ja sagt.
