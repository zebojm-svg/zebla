# Zebla — Stadtplan

Lebende Notiz für Mensch und Cursor. Kurz, damit man beim nächsten Mal nicht den Park mit der Stadt verwechselt. Jean-Marie redet normal; Cursor hält das hier aktuell.

## Betroffene App

Nur **Zebla** (`zebojm-svg/zebla`, live [zebla.zebotools.ch](https://zebla.zebotools.ch)). Hub, PortFolio, Examinator, Zentrale bleiben unberührt.

**Mensch:** Jean-Marie, kein Programmierer. UI auf Deutsch, einfach.

Nur **eigene Figuren**, keine Petit-Nicolas-Kopien in der App. Petit Nicolas darf als **Unterrichts-Video** (YouTube) vorkommen — das ist Examinator/Unterricht, nicht der Film-Generator.

## So ist die Stadt gebaut

1. **Geschichte = Ordner.** Dialog, Skript (Film-Prompt), Storyboard, Film und Diashow liegen zusammen. Neue Geschichte legt den Ordner selbst an.
2. **Welt-Regal** (`/library`): Figuren, Räume, Möbel, Skizzen — über allen Geschichten. Zeichnen nur, wenn etwas fehlt. Gleiche Person (Ramo 1 / Ramo 2) bleibt getrennt; Ernten aus einem Standbild ist kein zweites Gesicht. **Korrektur 27. Nov:** als Bauteil-Regal (ausschneiden und hinlegen) scheitert die Wiedererkennung. Neue Richtung unten: Katalog von Referenzbildern. Eine neue Sicht wird neu gezeichnet, die Referenz geht mit.
3. **Meta-Blatt** auf der Dialog-Seite: wer spielt, Stimmen, Räume, Licht/Blick. Gilt für die ganze Geschichte.
4. **Standbilder zuerst.** Ein Bild je Zeile. Die Kamera trifft Regie-Entscheidungen — nicht immer der ganze Raum. Erstes Sprechen in einer Szene = **Grundbild** (wer wo sitzt). Wenn jemand spricht = **Nahaufnahme** dieser Person. Handlung dazwischen (Tee, Klopfen, Tür) = **Zwischenbild** (Insert), neues Standbild, nicht das Wohnzimmer kopieren. Nahaufnahme = **Kamera wechselt den Platz** (FLUX Kontext auf das Grundbild): man schaut der Person ins Gesicht. Gemini dreht nur den Kopf — deshalb nicht für Nahaufnahmen. Weit-Bilder bleiben Gemini. Laufen durchs Bild kommt später.
   **Dialog darf mehr als Dialog sein.** Zeilenart: Dialog / Handlung / Erzähler. Handlung ist still (Bild + Geräusch: Wasser, Kessel pfeift, Plätschern, Klopfen). Erzähler wird gesprochen — eigene Stimme unter «Stimmen anpassen», nicht die Kinderstimmen. Geschichte («Ramo hat Freunde eingeladen») ist Erzähler, nicht stille Handlung. Tee-Reihenfolge: Wasser in denselben Kessel an der Spüle, dann denselben vollen Kessel auf denselben Herd (Gas bleibt Gas, Induktion bleibt Induktion), dann Pfeifen, dann Eingießen. Vorige Küchenbilder gehen als Vorlage mit, damit Kanne und Herd gleich bleiben.
   **Ein Bild = ein Ort.** Küche und Wohnzimmer sind zwei Räume. Die Bild-KI bekommt Vorlagen mit Beschriftung: Raum (Küche oder Wohnzimmer), Stammbild der Figur (Khan bleibt Khan), Grundbild nur von diesem Ort. Zwischenbilder in der Küche bekommen das **vorige Küchenbild** mitgeschickt — dieselbe Kanne, derselbe Herd (Gas bleibt Gas, Induktion bleibt Induktion), nicht die leere Bibliotheks-Küche. Wasser in den Kessel an der Spüle **bevor** er auf den Herd kommt. Khan- und Schöme-Zeilen bekommen je ein eigenes Bild. Kein Mädchen erfinden, wenn nur Jungen genannt sind.
   **Szenen im Dialog, nicht auf dem Board.** «Dialog daraus machen» teilt den Prompt in Szenen mit Handlung und eigenem gesprochenen Text. Das Board malt nur diese Szenen — keine Extra-Szenen einfügen, keinen Dialog dort nachschreiben. Kopierter Dialog wird verworfen.
   **Board-Zeile und Text-Seite (Lesen zuerst):** pro Bild/Zeile getrennte Reihen **Deutsch** (ganzer Satz, keine Birkenbihl-Wortfolge; Namen lateinisch: Ramo, Ubai, Schöme) · **Zielsprache** (z. B. Persisch) · **Birkenbihl** · **Lautschrift** wenn nötig. Deutsch bleibt sichtbar, auch wenn Persisch da ist. Alte Filme ohne Deutsch: «Deutsch unter die Zeilen» (Bilder bleiben). Neue Filme: «Dialog daraus machen», dann Bilder → **«Bilder planen»** (Deutsch reicht, ohne auf Persisch zu warten). «Zielsprache machen» bleibt ein eigener Knopf unter Text. Jedes Standbild ist ein nummeriertes **Bild-Päckchen** (Bild 1, Bild 2, …): links das Foto, rechts **Sprecher** (oder keiner = stumm, kein Audio) · **Text** (die drei Sprachzeilen) · **Handlung** · **Regie**. Darunter der Änderungs-Hinweis; löschen oder ein neues Päckchen dazwischen. Bild ändern: ein Hinweis + «Bild ändern» — der **Hinweis zuerst**, höchste Priorität, einmal wiederholt (Hinweis ist die Regie; Fotos sind Aussehen). **«wie in Bild 3»** schickt genau dieses Foto an FLUX, nicht das aktuelle. Sitzplan vom Board nur wenn der Hinweis dazu schweigt. Stimmen jederzeit über «Stimmen anpassen» (auch Erzähler). Beim Abspielen: jedes gemalte Bild der Reihe nach — Zwischenbilder mit Geräusch, Erzähler spricht, Dialog spricht (Zielsprache). Die Zeilen kommen vom Bild (lineIds) oder vom Szenentitel, nicht nur von einer Abschnitts-Id (Gemini schreibt oft «1»). Stimme als lokale Datei; Probesatz und Stimme wählen pro Figur. Probe nacheinander ohne Seiten-Reload; ist Google voll, kurzer deutscher Satz («in einer Minute nochmal Probe»), keine englische Quota-URL. Bekannte Jungennamen bleiben männlich. Ton: leise persische KI-Musik (Lyria, Loop; kein Game-Boy-Piepsen, kein Stadtbrummen), plus die Geräusche aus der Ton-Regie.
5. **Diashow** bleibt die Lernansicht derselben Geschichte, kein zweites Produkt.
6. **Figuren stellen ohne KI.** Nach dem Ernten: ziehen und zoomen auf Film/Storyboard. Die Lage bleibt gespeichert.
7. **Freisteller sitzen im Raum.** Kontakt-Schatten unter den Figuren. In der Vorschau leichtes Atmen und Blinzeln (noch keine Lippen).
8. **Möbel-Ernte.** Stuhl, Bank, Tisch, Rolltreppe usw. aus dem Bildtext — nach der Szene ins Welt-Regal.

Teure Bewegung (sprechen/laufen als Film) **erst** wenn Board und Stil stimmen.

## Zebla denkt nicht — es reicht weiter

Zebla malt nicht selbst und überlegt nicht selbst. Es hängt Prompts und Fotos von einer KI zur nächsten:

1. **Drehbuch-KI** liest die Geschichte und schreibt Inventar: Figuren, Räume, **jede wiederkehrende Sache** mit fester id. Wenn Khan Blumen mitbringt und sie später auf dem Tisch stehen — dieselben Blumen (`blumen-1`). Gleiche Regel für Kanne, Tablett, Mantel, Zeitung.
2. **Vorlagen-Check** (zweite KI, nur JSON, malt nicht): für jedes **neue** Standbild, welche Fotos mitmüssen.
3. **Bild ändern** = **FLUX Kontext Max** plus den Hinweis wörtlich. Eingangsfoto: wenn der Hinweis **«wie in Bild n»** sagt, genau dieses Päckchen-Still — sonst das aktuelle. Das ist eine **neue Stellung**, wenn der Hinweis das sagt — nicht nur Farbe. Pro hält Gruppenbilder zu fest. Kein Gemini, keine Stichwörter. UX: nummeriertes Päckchen, ein Hinweis + «Bild ändern».
4. **Bild-KI** beim ersten Malen: Gemini + `stillReferencePack` (höchstens vier Fotos), voriges Bild wo **diese** Sache sichtbar war, Ort, Gesicht. Beim Ändern: FLUX nimmt das genannte oder aktuelle Still und folgt dem Satz.

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
| Weit-Bilder / erstes Malen (Gemini) | [Google AI Studio](https://aistudio.google.com) → Usage / Billing |
| Bild ändern + Nahaufnahmen (FLUX) | [Replicate Billing](https://replicate.com/account/billing) |
| Live/Deploy | [Vercel Zebla](https://vercel.com/zebojm-svgs-projects/zebla) · Anmeldung nur auf [zebla.zebotools.ch](https://zebla.zebotools.ch) — Vercel-Git-Vorschau (`…-git-….vercel.app`) darf Google nicht |
| Zebla intern | App oben **Pro** (Master = fast kein Limit) |

## Richtung (27. Nov 2026, korrigiert)

Wiederverwenden als Bauteil hat nicht geklappt. Ein Gesicht aus einer neuen Sicht muss neu gezeichnet werden.

- **Katalog von Referenzen:** Figuren, Räume, Geräusche. «Ein Raum wie dieser», dazu Parameter (andere Möbel). Die Referenz bleibt dieser Raum.
- **Jedes neue Bild wird neu gezeichnet.** Die Referenzbilder gehen jedes Mal mit, damit dieselbe Figur und derselbe Raum wiedererkennbar bleiben.
- **Die KI legt eine Referenz an oder nimmt eine aus dem Katalog.** Fehlt Reto, entsteht einmal sein Referenzbild. Danach hängt jedes Bild von Reto daran.
- **Eine Regie liest die ganze Geschichte**, bevor ein Bild entsteht. Sie hält fest, wer die Leute im Hintergrund sind und worauf ein Wort sich bezieht. Das Wort «Afrika» an einer anderen Stelle ändert die Menge auf dem Rummelplatz nicht.
- **Geräusche** sind Referenzen im selben Katalog. Die Regie wählt sie aus der ganzen Geschichte.
- **Eine Tür** bleibt: Promptfenster. «Diese Figur als Reto, diese als Sabrina, die Geschichte so.» Änderung im selben Fenster trifft ein Bild.
- Stimmen bleiben an der Figur. Persisch und Birkenbihl erst danach. Bewegungsfilm später.

**Live mit diesem Schritt:** Katalog unter «Katalog» (früher Welt). Figur und Raum zeichnen, bestehendes Bild als Referenz nehmen, «Raum wie dieser» mit einem Satz (anderes Sofa). Geräusch merken (Name und Satz, noch keine Ton-Datei). Neue Posen nehmen das Referenzbild, nicht das älteste Posenfoto. Stil **Filmzeichnung** gilt auch für «Alle Dialogbilder neu», nicht nur für die Szenen auf Bilder. Auf **Bilder** gibt es Reiter für den Zeichenstil. Die gewählte Kachel gilt, wenn die Regie eine Szene neu zeichnet. Alte Bilder bleiben, bis sie neu erzeugt werden. Foto nur, wenn «Echte Menschen» oder «Fotorealistisch» bewusst gewählt ist. Beim Erzeugen liest die Regie den Dialog, plant wo der Blick wechselt und wohin er zurückgeht, zeichnet Stammbild, Seitenansicht und Raum (im Katalog, auch wenn sie im Film nicht als Szene vorkommen) und schickt die passenden früheren Bilder mit jedem Szenenbild.

**Blinzeln, Kopf, Mund (27. Nov, abends):** In der Vorschau der ausgeschnittenen Figuren gibt es schon leichtes Blinzeln. Mund und eine kleine Kopfbewegung als echter Film sind möglich, kosten deutlich mehr und kommen erst, wenn die Standbilder sitzen.

**Ordnung (27. Nov, nachmittags):** Figuren zuerst nach Stil, dann eine Figur im Stehen. Die anderen Ansichten erst nach einem Klick. Räume zuerst nach Stil, dann nach Ort (Draussen, Wald, Strand, See, Pool, Küche, Wohnzimmer, …). Ein neuer Raum landet über Stichwörter am selben Ort. Suchen im Katalog nach Name, Ort, Brille, Sofa. Keine Bilder aus Google. Bekannte Figuren nicht nachmachen lassen.

**Zeitlimit beim Bild (27. Nov, abends):** Die Seite hat nach knapp einer Minute abgebrochen und so getan, als wären mehrere Bilder zugleich verlangt worden. Ein Bild darf jetzt länger brauchen. Die Meldung sagt: noch einmal versuchen.

**Archiv (27. Nov, abends):** Bisherige Figuren liegen zugeklappt im Archiv. Sie bleiben für alte Filme. Neue Figuren speichern den Satz an die Bild-KI. Das Archiv macht alte Bilder nicht nachträglich rechtssicher. Es hält sie aus neuen Geschichten heraus. Der gespeicherte Satz zeigt, was bestellt wurde. Ein Archiv allein schützt nicht, wenn der Satz eine bekannte Figur verlangt.

Warum das Bisherige die Wiedererkennung verliert:

- Das Regal erntet Ausschnitte und legt sie in die Szene. Eine neue Perspektive geht so nicht.
- Beim Malen höchstens vier Fotos, oft nur die aktuelle Zeile. Gemini (weit) und FLUX (nah) haben kein gemeinsames Gedächtnis.
- Manche Regeln sind Stichwörter (Tee, Klopfen, Nuss). Dasselbe Muster wie «Afrika» → andere Leute.

Reihenfolge:

1. Katalog: Figur, Raum, Geräusch anlegen oder wählen. **Gebaut.**
2. Regie liest die ganze Geschichte und schreibt den Zusammenhang. **Gebaut:** Lage, Gesichter, Orte, und welcher Blick zu welchem früheren Bild gehört. Vor den Szenenbildern: Stammbild, davon abhängige Seitenansicht (einmal geprüft), Raum. Alles im Katalog. Ein Wort in einer Zeile ändert die Lage nicht. Bekannte Figuren nicht nachmachen.
3. Jedes Bild der Geschichte neu, mit diesen Referenzen. Noch nicht.
4. «Raum wie dieser, andere Möbel» im Katalog. **Gebaut.** In der Geschichte noch nicht von allein.

## Stand (2026-10)

**Live (main):** Projektordner, Welt-Regal, Meta-Blatt, Szene-für-Szene-Standbilder, «Bild neu malen», Figuren ziehen/zoomen, Schatten und Blinzeln, Möbel-Ernte, Bibliothek löschen, Deutsch unter den Zeilen, Szene abspielen mit Stimme, Board als Comic-Zeile, KI-Musik (Lyria), Szenen nur im Dialog aus dem Prompt, Kamera-Regie (Nahaufnahme wer spricht, Zwischenbilder, Handlung/Erzähler im Dialog), Geräusche zur Handlung (Wasser, Pfeifen, Plätschern, Klopfen), Erzählerstimme unter Stimmen anpassen, Ortssperre (Küche ≠ Wohnzimmer), Vorlagenpaket für die Bild-KI (Raum + Figuren + Grundbild dieses Ortes), eigenes Bild je Sprecher, gleiche Kanne und Herd über die Küchenbilder, Erzähler spricht auch wenn die KI «Handlung» geschrieben hat, zugeordnete Stimmen trotz Schreibweise (Schöme/Schoeme, Off/Erzähler), **Drehbuch → Inventar → Vorlagen** (jede wiederkehrende Sache behält dieselbe id und wandert mit dem vorigen Foto **dieser** Sache: Blumen an der Tür, später auf dem Tisch; Kanne/Tablett derselbe Mechanismus, keine Extra-Tee-Logik), Zwischenbilder auf Augenhöhe, **Bild ändern als Packzettel** (`planStillEditPackzettel` → `{ imagePrompt, imageIds[] }`: Katalog + Hinweis an die Drehbuch-KI, genau diese Fotos an die Bild-KI; keine Stichwörter `allein`/`am Herd` — PR #74 nicht mergen), **Bild ändern mit Vorlagen-Check** (voriges Ortsbild, Requisiten, Personen — spätere Bilder der Szene neu), **Bild ändern mit FLUX Kontext Max** (harte Restage-Regie; Pro hält Gruppen zu fest), **Dialog zuerst Muttersprache** («Dialog daraus machen» schreibt Deutsch; Zielsprache, Lautschrift und Birkenbihl erst mit «Zielsprache machen» unter Text), **drei Sprachzeilen** (Deutsch · Zielsprache · Birkenbihl · Lautschrift), **Anmeldung / API-Boot** (Hub-Kachel, sso_mint, `/api/health` — kaputter Typ in `lib/ai.ts` behoben), **Zielsprache in Paketen** (ein Klick «Zielsprache machen»: Abschnitt oder ~8 Zeilen plus Birkenbihl; Knopf «läuft», dann «noch X Zeilen»; fertige Zeilen bleiben), **ein Knopf «Bilder planen»** auf Bilder (kein zweiter Zielsprache-Knopf dort; fehlt die Übersetzung, Satz «Zielsprache machst du unter Text»), **erster Bildplan lokal** (`planBoardWithoutAi`, sofort gespeichert, ohne auf Gemini zu warten — kein 60s-Loch auf der leeren Seite). Nach dem Live-Deploy auf [zebla.zebotools.ch](https://zebla.zebotools.ch): alte Filme ohne Deutsch **«Deutsch unter die Zeilen»**; neue Filme **Dialog daraus machen**, unter Text **Zielsprache machen**, auf Bilder **Bilder planen**.

**In Arbeit:** nummerierte **Bild-Päckchen** (Sprecher / Text / Handlung / Regie, löschen, dazwischen einfügen) und **«wie in Bild n»** als FLUX-Foto. Noch nicht mergen, bis Jean-Marie «ok mergen» sagt.

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
