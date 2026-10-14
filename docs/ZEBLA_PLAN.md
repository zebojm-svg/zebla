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
   **Dialog darf mehr als Dialog sein.** Zeilenart: Dialog / Handlung / Erzähler. Handlung ist still (Bild + Geräusch: Wasser, Kessel pfeift, Plätschern, Klopfen). Erzähler wird gesprochen — eigene Stimme unter «Stimmen anpassen», nicht die Kinderstimmen. Geschichte («Ramo hat Freunde eingeladen») ist Erzähler, nicht stille Handlung. Tee-Reihenfolge: Wasser in denselben Kessel an der Spüle, dann denselben vollen Kessel auf denselben Herd (Gas bleibt Gas, Induktion bleibt Induktion), dann Pfeifen, dann Eingießen. Vorige Küchenbilder gehen als Vorlage mit, damit Kanne und Herd gleich bleiben.
   **Ein Bild = ein Ort.** Küche und Wohnzimmer sind zwei Räume. Die Bild-KI bekommt Vorlagen mit Beschriftung: Raum (Küche oder Wohnzimmer), Stammbild der Figur (Khan bleibt Khan), Grundbild nur von diesem Ort. Zwischenbilder in der Küche bekommen das **vorige Küchenbild** mitgeschickt — dieselbe Kanne, derselbe Herd (Gas bleibt Gas, Induktion bleibt Induktion), nicht die leere Bibliotheks-Küche. Wasser in den Kessel an der Spüle **bevor** er auf den Herd kommt. Khan- und Schöme-Zeilen bekommen je ein eigenes Bild. Kein Mädchen erfinden, wenn nur Jungen genannt sind.
   **Szenen im Dialog, nicht auf dem Board.** «Dialog daraus machen» teilt den Prompt in Szenen mit Handlung und eigenem gesprochenen Text. Das Board malt nur diese Szenen — keine Extra-Szenen einfügen, keinen Dialog dort nachschreiben. Kopierter Dialog wird verworfen.
   **Board-Zeile und Text-Seite (Lesen zuerst):** pro Bild/Zeile getrennte Reihen **Deutsch** (ganzer Satz, keine Birkenbihl-Wortfolge; Namen lateinisch: Ramo, Ubai, Schöme) · **Zielsprache** (z. B. Persisch) · **Birkenbihl** · **Lautschrift** wenn nötig. Deutsch bleibt sichtbar, auch wenn Persisch da ist. Alte Filme ohne Deutsch: «Deutsch unter die Zeilen» (Bilder bleiben). Neue Filme: «Dialog daraus machen», dann Bilder → **«Bilder planen»** (Deutsch reicht, ohne auf Persisch zu warten). «Zielsprache machen» bleibt ein eigener Knopf unter Text. Bild ändern unter dem Bild: ein Hinweis + «Bild ändern» — der **Hinweis zuerst**, höchste Priorität, einmal wiederholt (Hinweis ist die Regie; Fotos sind Aussehen). Sitzplan vom Board nur wenn der Hinweis dazu schweigt. Kamera/Sitzplan/Skizze hinter **Regie**. Stimmen jederzeit über «Stimmen anpassen» (auch Erzähler). Beim Abspielen: jedes gemalte Bild der Reihe nach — Zwischenbilder mit Geräusch, Erzähler spricht, Dialog spricht (Zielsprache). Die Zeilen kommen vom Bild (lineIds) oder vom Szenentitel, nicht nur von einer Abschnitts-Id (Gemini schreibt oft «1»). Stimme als lokale Datei; Probesatz und Stimme wählen pro Figur. Probe nacheinander ohne Seiten-Reload; ist Google voll, kurzer deutscher Satz («in einer Minute nochmal Probe»), keine englische Quota-URL. Bekannte Jungennamen bleiben männlich. Ton: leise persische KI-Musik (Lyria, Loop; kein Game-Boy-Piepsen, kein Stadtbrummen), plus die Geräusche aus der Ton-Regie.
5. **Diashow** bleibt die Lernansicht derselben Geschichte, kein zweites Produkt.
6. **Figuren stellen ohne KI.** Nach dem Ernten: ziehen und zoomen auf Film/Storyboard. Die Lage bleibt gespeichert.
7. **Freisteller sitzen im Raum.** Kontakt-Schatten unter den Figuren. In der Vorschau leichtes Atmen und Blinzeln (noch keine Lippen).
8. **Möbel-Ernte.** Stuhl, Bank, Tisch, Rolltreppe usw. aus dem Bildtext — nach der Szene ins Welt-Regal.

Teure Bewegung (sprechen/laufen als Film) **erst** wenn Board und Stil stimmen.

## Zebla denkt nicht — es reicht weiter

Zebla malt nicht selbst und überlegt nicht selbst. Es hängt Prompts und Fotos von einer KI zur nächsten:

1. **Drehbuch-KI** liest die Geschichte und schreibt Inventar: Figuren, Räume, **jede wiederkehrende Sache** mit fester id. Wenn Khan Blumen mitbringt und sie später auf dem Tisch stehen — dieselben Blumen (`blumen-1`). Gleiche Regel für Kanne, Tablett, Mantel, Zeitung.
2. **Vorlagen-Check** (zweite KI, nur JSON, malt nicht): für jedes **neue** Standbild, welche Fotos mitmüssen.
3. **Bild ändern** = **Hinweis zuerst** (höchste Priorität, einmal wiederholt), dann `stillReferencePack` ohne vorige Erzähl-Bilder desselben Ortes. Stehender Satz: **Hinweis ist die Regie; Fotos sind Aussehen.** Widerspricht der Board-Sitzplan/Kamera/wer-im-Bild dem Hinweis — gilt der Hinweis. Board-Stellung nur wenn der Hinweis dazu schweigt. Fotos: Sprecher-Gesicht/Kleidung, leeres Orts-Grundbild, Requisite nur wenn das Foto keine extra Leute zeigt (Bibliotheks-Freisteller vor Tisch mit Gästen). Kein aktuelles Tischbild als GROUNDBILD. Kein Packzettel, kein Filmkatalog. Keine Stichwörter (`allein`, `am Herd`, `keine Gäste`) — PR #74 nicht das Produkt. UX: ein Hinweis + «Bild ändern». Rot nur wenn das **Malen** scheitert, mit Grund (402 / Zeitlimit).
4. **Bild-KI** beim ersten Malen: kleines Paket (höchstens vier Fotos), voriges Bild wo **diese** Sache sichtbar war, Ort, Gesicht. Beim Ändern: Hinweis zuerst, dann Sprecher + leeres Ortsbild + isolierte Requisite — nicht das vorige 3-Personen-Küchenbild, nicht das gescheiterte aktuelle Still.

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

**Live (main):** Projektordner, Welt-Regal, Meta-Blatt, Szene-für-Szene-Standbilder, «Bild neu malen», Figuren ziehen/zoomen, Schatten und Blinzeln, Möbel-Ernte, Bibliothek löschen, Deutsch unter den Zeilen, Szene abspielen mit Stimme, Board als Comic-Zeile, KI-Musik (Lyria), Szenen nur im Dialog aus dem Prompt, Kamera-Regie (Nahaufnahme wer spricht, Zwischenbilder, Handlung/Erzähler im Dialog), Geräusche zur Handlung (Wasser, Pfeifen, Plätschern, Klopfen), Erzählerstimme unter Stimmen anpassen, Ortssperre (Küche ≠ Wohnzimmer), Vorlagenpaket für die Bild-KI (Raum + Figuren + Grundbild dieses Ortes), eigenes Bild je Sprecher, gleiche Kanne und Herd über die Küchenbilder, Erzähler spricht auch wenn die KI «Handlung» geschrieben hat, zugeordnete Stimmen trotz Schreibweise (Schöme/Schoeme, Off/Erzähler), **Drehbuch → Inventar → Vorlagen** (jede wiederkehrende Sache behält dieselbe id und wandert mit dem vorigen Foto **dieser** Sache: Blumen an der Tür, später auf dem Tisch; Kanne/Tablett derselbe Mechanismus, keine Extra-Tee-Logik), Zwischenbilder auf Augenhöhe, **Bild ändern als Packzettel** (`planStillEditPackzettel` → `{ imagePrompt, imageIds[] }`: Katalog + Hinweis an die Drehbuch-KI, genau diese Fotos an die Bild-KI; keine Stichwörter `allein`/`am Herd` — PR #74 nicht mergen), **Bild ändern mit Vorlagen-Check** (voriges Ortsbild, Requisiten, Personen — spätere Bilder der Szene neu), **Dialog zuerst Muttersprache** («Dialog daraus machen» schreibt Deutsch; Zielsprache, Lautschrift und Birkenbihl erst mit «Zielsprache machen» unter Text), **drei Sprachzeilen** (Deutsch · Zielsprache · Birkenbihl · Lautschrift), **Anmeldung / API-Boot** (Hub-Kachel, sso_mint, `/api/health` — kaputter Typ in `lib/ai.ts` behoben), **Zielsprache in Paketen** (ein Klick «Zielsprache machen»: Abschnitt oder ~8 Zeilen plus Birkenbihl; Knopf «läuft», dann «noch X Zeilen»; fertige Zeilen bleiben), **ein Knopf «Bilder planen»** auf Bilder (kein zweiter Zielsprache-Knopf dort; fehlt die Übersetzung, Satz «Zielsprache machst du unter Text»), **erster Bildplan lokal** (`planBoardWithoutAi`, sofort gespeichert, ohne auf Gemini zu warten — kein 60s-Loch auf der leeren Seite). Nach dem Live-Deploy auf [zebla.zebotools.ch](https://zebla.zebotools.ch): alte Filme ohne Deutsch **«Deutsch unter die Zeilen»**; neue Filme **Dialog daraus machen**, unter Text **Zielsprache machen**, auf Bilder **Bilder planen**.

**In Arbeit:** «Bild ändern» — Hinweis zuerst (höchste Priorität, einmal wiederholt); keine vorigen Erzähl-Stills desselben Ortes (die haben die Gäste kopiert). Live nach #82 malt wieder, aber der Sitzplan + vorige Küchenbilder haben den Hinweis überstimmt. Noch nicht mergen, bis Jean-Marie «ok mergen» sagt. Keine Stichwörter `allein`/`am Herd`. #74 nicht mergen.

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
