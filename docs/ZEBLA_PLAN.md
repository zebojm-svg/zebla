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
3. **Bild ändern** = wie erstes Malen: Regie plant **neu** mit dem Hinweis (höchste Priorität), Raumbild, Stammbilder, Nachbarbilder; Gemini malt mit denselben Vorlagen. **«wie in Bild n»** nimmt genau dieses Päckchen als Vorlage mit. Kein FLUX nur mit altem Foto und Satz. UX: nummeriertes Päckchen, ein Hinweis + «Bild ändern».
4. **Bild-KI** beim ersten Malen ohne Plan (Fallback): Gemini + `stillReferencePack` (höchstens vier Fotos). Normalweg: Regie-Plan + Vorlagen (Raum, Gesicht, vorige Bilder). Die Regie prüft hart: Einrichtung, Kleidung, Bildschirm-Vorderseite, Körper/Haltung, Ausdruck zum Satz. **Gesamtschau** vergleicht Kleidung und Schreibtisch über die Szene.

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
- **Nicht für jeden Ort einen festen Satz.** Videochat, See, Ente, Schwan gehören nicht als eigene Regeln in Zebla. Die Regie liest den Dialog, sagt der Bild-KI was dieses Bild zeigen muss, schaut das fertige Bild an und schickt es einmal zurück, wenn es nicht zum Satz passt. Für den Nutzer bleibt ein Knopf. Der Videochat-Satz von vorher ist nur ein Pflaster.
- **Geräusche** sind Referenzen im selben Katalog. Die Regie wählt sie aus der ganzen Geschichte.
- **Eine Tür** bleibt: Promptfenster. «Diese Figur als Reto, diese als Sabrina, die Geschichte so.» Änderung im selben Fenster trifft ein Bild.
- Stimmen bleiben an der Figur. Persisch und Birkenbihl erst danach. Bewegungsfilm später.

**Live mit diesem Schritt:** Katalog unter «Katalog» (früher Welt). Figur und Raum zeichnen, bestehendes Bild als Referenz nehmen, «Raum wie dieser» mit einem Satz (anderes Sofa). Geräusch merken (Name und Satz, noch keine Ton-Datei). Neue Posen nehmen das Referenzbild, nicht das älteste Posenfoto. Stil **Filmzeichnung** gilt auch für «Alle Dialogbilder neu», nicht nur für die Szenen auf Bilder. Den Zeichenstil stellt man auf der Dialogseite direkt über «Alle Dialogbilder neu», und gleich noch einmal unter Bilder. Die gewählte Kachel gilt für die nächsten Bilder. Im **Katalog** sagt «Nehmen» der Regie, welches schon gezeichnete Bild diese Geschichte verwenden soll. Der Name muss derselbe sein wie im Dialog. «Bilder planen» legt leere Bildplätze an und malt nicht ein altes Katalogbild hinein. Der Knopf «Diese Szene erzeugen» oder «Szene neu erzeugen» steht direkt unter dem Szenentitel, nicht hinter einem Dreieck. Ein Flur aus dem Katalog gehört nicht in einen Videochat, nur weil irgendwo «Tür» steht. Beim Erzeugen einer Szene zeichnet die Regie zuerst die Referenzbilder nacheinander und schickt sie danach an die Bild-KI. Ein Videogespräch bleibt getrennt: im Raum nur eine Person, die andere höchstens einmal im Laptop. Kein zweites Gesicht, kein Headset das verschwindet, keine fremde Person, kein gemeinsamer Tisch. Alte Bilder bleiben, bis sie neu erzeugt werden. Foto nur, wenn «Echte Menschen» oder «Fotorealistisch» bewusst gewählt ist. Beim Erzeugen liest die Regie den Dialog, plant wo der Blick wechselt und wohin er zurückgeht, zeichnet Stammbild, Seitenansicht und Raum (im Katalog, auch wenn sie im Film nicht als Szene vorkommen) und schickt die passenden früheren Bilder mit jedem Szenenbild.

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
2. Regie liest die ganze Geschichte und schreibt den Zusammenhang. **Gebaut:** Lage, Gesichter, Orte, und welcher Blick zu welchem früheren Bild gehört. Vor den Szenenbildern: Stammbild, Seitenansicht (einmal geprüft), **Raumbild je Ort** (leer, Einrichtung fest; Regie prüft; im Regiebuch sichtbar mit «Raumbild zeichnen/ändern»). Fehlt ein Raumbild: Warnung, «Raumbilder zuerst zeichnen» oder bewusst ohne. Ein Wort in einer Zeile ändert die Lage nicht.
3. Jedes Bild der Geschichte neu, mit diesen Referenzen. Noch nicht.
4. «Raum wie dieser, andere Möbel» im Katalog. **Gebaut.** In der Geschichte noch nicht von allein.

## Regie als eigener Agent (28. Nov 2026, so steht es)

Zebla gibt das Ziel, die Regie entscheidet den nächsten Schritt. Heute bestimmt noch Zebla die Reihenfolge — das wird umgebaut.

- **Regie** = der Agent, verantwortlich für den ganzen Film. **Bild-KI** malt nur, ohne Gedächtnis. **Zebla** = Fenster, speichert, zeigt Fortschritt, setzt Grenzen (Kosten, Versuche, Zeit). Keine Regeln über Orte, Tiere, Videochat im Programm.
- **Regiebuch** = Gedächtnis der Regie für diese Geschichte: Personen (Aussehen, Kleidung, was sie tragen), Orte (ein oder zwei Räume, wer wo), je Bild «muss zeigen / darf nicht / schliesst an Bild n an». **Jean-Marie sieht es und kann darin korrigieren.**
- **Werkzeuge der Regie:** Katalog suchen, Referenzbild zeichnen lassen, Szenenbild malen lassen (mit gewählten Referenzen), Bild anschauen, ins Regiebuch schreiben, Jean-Marie fragen.
- **Ablauf:** lesen → Regiebuch → Bilder planen → Referenzen vorbereiten und prüfen → Bild für Bild malen und anschauen → ganze Szene nebeneinander anschauen → Korrektur im Promptfenster ändert das Regiebuch, Regie wählt die betroffenen Bilder.
- **Fragen:** Lässt der Dialog etwas offen (selber Raum?), fragt die Regie kurz und macht dann weiter.
- **Versuche:** ein Bild höchstens **zweimal** neu, dann markiert für Jean-Marie.
- **Etappen:** Eine Anfrage darf höchstens drei Minuten dauern. Die Regie arbeitet in Etappen und schreibt nach jeder ins Regiebuch, wo sie steht. Für Jean-Marie ein Ablauf mit Fortschritt.
- **Modell:** Die Regie (Geschichte lesen, planen, Bilder anschauen) denkt mit **Gemini Pro**. Kleine Aufgaben (übersetzen, Stichwörter) bleiben auf Flash. Fehlt Pro am Schlüssel, nimmt sie Flash. **Live.**
- Feste Sätze (Videochat, Tee, Klopfen, Nuss) fallen erst weg, wenn die Regie dieselben Fälle selbst richtig löst.

Bauschritte:

1. Regiebuch anlegen und auf der Bilder-Seite zeigen, korrigierbar. **Gebaut:** oben auf Bilder, offen. Wo und wie, Personen, Orte, «Was sonst gilt», welches Bild woran anschliesst. «Regiebuch speichern» = die Regie liest neu mit deinen Sätzen als Vorgabe. «Neu lesen» behält die Vorgaben. «Bilder planen» löscht ein geändertes Regiebuch nicht. **Stammbild (Nov 2026):** vor Planen/Malen vergleicht die Regie Katalog-Stammbild mit lookEn; passt Kleidung/Haar nicht, zeichnet Zebla neu, legt es in die Bibliothek, nur geprüfte Fotos gehen an den Maler. Im Regiebuch je Person: «Stammbild passt nicht — neu zeichnen». Regie prüft beim Anschauen Kleidung gegen Stammbild (hart).
2. Regie prüft jedes Bild aus dem Regiebuch, zwei Versuche, dann Markierung. **Gebaut:** nach jedem Bild ein eigener Schritt «Regie schaut an» (Regiebuch, Satz, Stammbild, frühere Bilder derselben Person und desselben Blicks). Allgemeine Prüfung, keine Ortslisten: jede Person höchstens einmal, nur wer laut Regiebuch hier ist, gleiches Aussehen, Dinge eines anderen Ortes nicht hier, Einstellung passt, keine Fantasie-Schrift. Fehler geht als Auftrag an den Maler; übernimmt das Bild Falsches aus einem früheren Bild, malt er ohne Ortsbilder. Unter jedem Bild: «Regie: passt» oder der Fehler.
   **2b. Planen aus dem Regiebuch — gebaut (28. Nov 2026), live noch nicht ausprobiert.** Anlass: Videochat Amir/Lena — Amir wurde zur Frau, Leute posierten für den Zuschauer, falscher Raum hinter der Person, Gegenschuss ohne andere Wand.
   - Vor jedem Bild plant die Regie (Pro, eigene Anfrage): welcher Ort, wer körperlich da ist, wer nur auf einem Bildschirm, wo die Kamera steht und wohin sie schaut, welche Vorlagen (höchstens 3) mit und wofür.
   - Ablauf je Bild: planen → malen → anschauen → bei Fehler neu malen (Plan bleibt, Korrektur dazu), höchstens zweimal.
   - Orte im Regiebuch sagen, was an welcher Wand ist. Gegenschuss = andere Wand.
   - **Ein Raum = ein Ort (28. Nov).** «Lenas Zimmer Karte» ist Lenas Zimmer, kein zweiter Ort (Regiebuch, Plan, Anschauen). Ein Ort ist der leere Raum: wer wo sitzt, steht im Plan je Bild, nicht im Ort. Zwei Zimmer verschiedener Leute sehen klar anders aus (Wandfarbe, Fenster, Möbelseite, eigene Dinge); sind sie fast gleich beschrieben, fragt Zebla die Regie einmal nach. Alte Bilder können einen Raum kopiert haben — die Regie übernimmt das nicht. Gilt auch für schon gespeicherte Regiebücher, ohne «Neu lesen» (von Jean-Marie geänderte Texte bleiben, nur doppelte Orte fallen zusammen). Sind zwei Zimmer fast gleich, steht ein Hinweis im Regiebuch: «Neu lesen». Niemand posiert für den Zuschauer. Das steht im Regie-Text, nicht als Regel im Programm.
   - Mit Plan malt der Maler nur nach dem Plan: keine alten Ortsregeln, kein Heranfahren mit FLUX. «Bild ändern» mit Hinweis geht noch den alten Weg.
   - Unter jedem Bild ein Satz «Regie: …» (wo die Kamera steht).
   - Alte Regiebücher: einmal «Neu lesen», damit die Orte die Wände beschreiben.
   - Kosten: ein Pro-Aufruf mehr pro Bild (etwa 1–2 Rappen).
   - **Erster Lauf (28. Nov):** alle 6 Bilder auf dem alten Weg gemalt, der Plan griff nicht und niemand sah es. Folgen: Amir an einem zweiten Pult (Bild 2), Lena auf dem Bildschirm vor Amirs Zimmer (Bild 5).
   - **Nie mehr still:** Kann die Regie nicht planen, steht unter dem Bild «Regie konnte dieses Bild nicht planen: Grund. Gemalt wurde ohne Plan.» Auch in der Statuszeile. Jede Bild-Notiz beginnt mit «Gemalt nach dem Plan der Regie.» oder «Gemalt ohne Plan der Regie (alter Weg).»
   - Fehlt ein Ort im Regiebuch (z.B. nur ein Ort für zwei Zimmer), darf die Regie einen neuen Ort nennen und beschreiben. Er gilt. Ein Detail im selben Raum (Karte, Fenster) ist kein neuer Ort.
   - «Handlung», «Erzähler» sind keine Person: die Regie liest die Handlung und entscheidet, wer zu sehen ist.
   - Anschauen: die Regie bekommt ein früheres Bild vom selben Ort und eins vom anderen Ort («darf hier nicht erscheinen»). Wer auf einem Bildschirm ist, sitzt vor seinem eigenen Raum.
   - Regie-Planung darf bis 2 Minuten brauchen (vorher 1½).
   - **Anhalten:** Knopf neben der Statuszeile, solange eine Szene läuft. Der laufende Schritt läuft fertig, dann hört Zebla auf (nach Planen, Malen, Anschauen oder zwischen Bildern). Das letzte Bild bleibt. Danach: unter dem Bild schreiben, «Bild ändern», dann «Szene weiter erzeugen» (malt nur, was fehlt). Ist die Szene halb fertig, steht daneben «Ganze Szene neu erzeugen»: plant und malt alle Bilder neu, die alten bleiben sichtbar, bis das neue da ist.
   - **Verlauf je Bild:** zugeklappt «So ist das Bild entstanden»: Plan, Vorlagen an den Maler (mit Zweck, englisch), jeder Versuch mit Bild, Urteil und Auftrag der Regie. Höchstens 6 Versuche; neuer Durchgang oder «Bilder planen» fängt leer an.
   - **Neu lesen kaputt (28. Nov, behoben):** Lesen misslang (zu wenig Zeit für das längere Regiebuch), Zebla schrieb still ein leeres Ersatz-Regiebuch hinein und meldete «hat gelesen». Neu: ein echtes Regiebuch wird nie mehr überschrieben; misslingt es, steht «Die Regie konnte die Geschichte nicht lesen: Grund. Das bisherige Regiebuch bleibt.» «Neu lesen» darf 2½ Minuten brauchen; vor den Bildern ist Lesen ein eigener Schritt.
   - **Regiebuch besser:** Personen nur nach Aussehen (Alter, Haare, Haut, Kleidung mit Farben, Brille, was sie tragen) — kein Charakter. Orte Wand für Wand, mit Farben und Möbeln; zwei Orte nie gleich beschrieben. «Neu lesen» zeigt der Regie bis zu 4 schon gemalte, gutgeheissene Bilder.
   **2c. Regie prüft genauer — gebaut (28. Nov 2026), für jede Geschichte, keine Videochat-Regeln.** Anlass: 20 Bilder Lena/Amir, Regie sagte zu 15 «passt», darunter fremde Füsse, doppelte Bilder, falscher Raum um den Laptop.
   - Anschauen: zuerst beschreiben, was zu sehen ist (Leute, Hände/Füsse, Bildschirme, Wände, Blick), dann Prüfliste mit ja/nein: Leute, Körper, Aussehen, Ort, Bild im Bild, Handlung des Satzes, Kamera wie geplant, Blick, nicht fast gleich wie das vorige Bild. Schrift ist nur eine Kleinigkeit: steht unter dem Bild, malt nicht neu.
   - Die Regie sieht beim Anschauen: Auftrag an den Maler, Satz davor und danach, das vorige Bild, Raum-Vorlage, Stammbilder aller Leute im Bild (höchstens 6 Vergleichsbilder, verkleinert).
   - Ehrlich: kann die Regie nicht anschauen (Zeitlimit, Fehler, Bild fehlt), steht blau «Regie: nicht geprüft», nie mehr still «passt». Sie schaut dann einmal neu, malt aber nicht neu. Im Verlauf steht das Modell und was die Regie sah.
   - Bild im Bild allgemein: der Plan sagt, wo die Kamera steht (Ort), und für jede Fläche (Bildschirm, Fernseher, Spiegel, Anzeigetafel …), wer und welcher Ort darauf ist. Unter dem Bild: «Ort: … Auf …: …».
   - Planen: die Regie sieht kleine Bilder der Vorlagen (so sind die Bilder wirklich geworden). Braucht der Satz Neues, nimmt sie das vorige Bild nicht für Bildaufbau oder Haltung.
   - Fast gleiches Bild (Bildvergleich, ohne KI): gilt als Fehler, nächster Versuch ohne dieses Bild als Vorlage.
   - Nach zwei Neuversuchen bleibt der Versuch mit den wenigsten Fehlern, nicht einfach der letzte. Ein Bild mit Fehler nur am Blick oder an der Handlung bleibt Raum-Vorlage.
   - Kosten: etwa 1 Rappen mehr pro Bild (längere Prüfung, kleine Vorschaubilder); dafür weniger Neumalen bei Fehlalarm.
   **2d. Nach dem ersten Lauf (28. Nov 2026):**
   - Regie = Pro. Flash nur, wenn Google Pro am Schlüssel nicht kennt oder kein Kontingent hat — dann steht «Flash statt Pro, weil …» beim Urteil, beim Plan und im Regiebuch. Pro überlastet: kurz warten, noch einmal Pro; reicht die Zeit nicht, «nicht geprüft» mit Grund.
   - Kamera: sieht die Regie «von hinten», der Plan sagt «von vorne» (oder umgekehrt), ist Kamera ein Fehler, auch wenn sie «passt» angekreuzt hat. Möbel an anderer Wand als geplant = Fehler am Ort.
   - Bild ändern: rote Meldung sagt den Grund auf Deutsch (Bild-KI zu oft gefragt, Schutzfilter, kein Bild zurück, Verbindung weg, sonst der kurze Original-Grund).
   - Seite deutsch: was auf einem Bildschirm zu sehen ist, steht deutsch; Englisch nur für den Maler.
   - Mit Regie-Plan zeigt «Mehr» nicht mehr den alten Sitzplan/Blick/Gesicht vom Board (Daten bleiben).
3. Etappen mit Fortschritt statt ein langer Knopfdruck. Noch nicht.
4. Fragen an Jean-Marie. Noch nicht.
5. **Ganze Szene nebeneinander prüfen — gebaut.** Knopf «Szene prüfen» in der grünen Leiste je Szene (Seite Bilder), sobald mindestens ein Bild fertig ist — in einer Zeile mit «Ganze Szene neu erzeugen» und «Markierte Bilder ändern». Regie liest Dialog, kleine Bilder (~384 px), Raumbilder, je Anfrage höchstens zwei. Danach sind betroffene Bilder angehakt, Hinweis im Feld; Jean-Marie kann «Korrigieren». Nach kompletter Neuerzeugung läuft Prüfung einmal von selbst.
6. Feste Sätze herausnehmen. Noch nicht.

## Stand (2026-10)

**Live (main):** Projektordner, Welt-Regal, Meta-Blatt, Szene-für-Szene-Standbilder, «Bild neu malen», Figuren ziehen/zoomen, Schatten und Blinzeln, Möbel-Ernte, Bibliothek löschen, Deutsch unter den Zeilen, Szene abspielen mit Stimme, Board als Comic-Zeile, KI-Musik (Lyria), Szenen nur im Dialog aus dem Prompt, Kamera-Regie (Nahaufnahme wer spricht, Zwischenbilder, Handlung/Erzähler im Dialog), Geräusche zur Handlung (Wasser, Pfeifen, Plätschern, Klopfen), Erzählerstimme unter Stimmen anpassen, Ortssperre (Küche ≠ Wohnzimmer), Vorlagenpaket für die Bild-KI (Raum + Figuren + Grundbild dieses Ortes), eigenes Bild je Sprecher, gleiche Kanne und Herd über die Küchenbilder, Erzähler spricht auch wenn die KI «Handlung» geschrieben hat, zugeordnete Stimmen trotz Schreibweise (Schöme/Schoeme, Off/Erzähler), **Drehbuch → Inventar → Vorlagen** (jede wiederkehrende Sache behält dieselbe id und wandert mit dem vorigen Foto **dieser** Sache: Blumen an der Tür, später auf dem Tisch; Kanne/Tablett derselbe Mechanismus, keine Extra-Tee-Logik), Zwischenbilder auf Augenhöhe, **Bild ändern als Packzettel** (`planStillEditPackzettel` → `{ imagePrompt, imageIds[] }`: Katalog + Hinweis an die Drehbuch-KI, genau diese Fotos an die Bild-KI; keine Stichwörter `allein`/`am Herd` — PR #74 nicht mergen), **Bild ändern mit Vorlagen-Check** (voriges Ortsbild, Requisiten, Personen — spätere Bilder der Szene neu), **Bild ändern mit FLUX Kontext Max** (harte Restage-Regie; Pro hält Gruppen zu fest), **Dialog zuerst Muttersprache** («Dialog daraus machen» schreibt Deutsch; Zielsprache, Lautschrift und Birkenbihl erst mit «Zielsprache machen» unter Text), **drei Sprachzeilen** (Deutsch · Zielsprache · Birkenbihl · Lautschrift), **Anmeldung / API-Boot** (Hub-Kachel, sso_mint, `/api/health` — kaputter Typ in `lib/ai.ts` behoben), **Zielsprache in Paketen** (ein Klick «Zielsprache machen»: Abschnitt oder ~8 Zeilen plus Birkenbihl; Knopf «läuft», dann «noch X Zeilen»; fertige Zeilen bleiben), **ein Knopf «Bilder planen»** auf Bilder (kein zweiter Zielsprache-Knopf dort; fehlt die Übersetzung, Satz «Zielsprache machst du unter Text»), **erster Bildplan lokal** (`planBoardWithoutAi`, sofort gespeichert, ohne auf Gemini zu warten — kein 60s-Loch auf der leeren Seite). Nach dem Live-Deploy auf [zebla.zebotools.ch](https://zebla.zebotools.ch): alte Filme ohne Deutsch **«Deutsch unter die Zeilen»**; neue Filme **Dialog daraus machen**, unter Text **Zielsprache machen**, auf Bilder **Bilder planen**.

**Live (Nov 2026):** **Bild ändern** plant neu mit Hinweis, malt mit Raumbild und Stammbildern wie erstes Malen; Regie prüft Schreibtisch, Kleidung, Bildschirm-Vorderseite, Haltung, Ausdruck; **Szene prüfen** (Gesamtschau) vergleicht Kleidung und Schreibtisch über die Szene. **Bildnummer** auf jedem Päckchen durch die ganze Geschichte (Bild 1, 2, …). Im Hinweis: **«wie in Bild 3»** = dieses Foto mit; **«ohne Referenz von Bild 5»** / **«Bild 5 nicht»** = dieses Päckchen nicht als Vorlage (Regie, Packzettel, gemalte Refs).
- **Vorlage freigeben (28. Nov.):** Pro fertigem Bild «Als Vorlage freigeben» / «Vorlage sperren». Neu gemalte Bilder starten gesperrt. Nur freigegebene Szenen-Stills gehen an Regie, Maler, Urteil und «wie in Bild N» — auch bei positivem Hinweis streng. Raumbild, Stammbild und Katalog ohne Extra-Klick. Szene: «Alle fertigen Bilder als Vorlage freigeben», «Vorlagen prüfen». Gesamtschau kann freigeben vorschlagen. Ansehen bleibt immer möglich. **Stopp statt Warnung:** braucht ein neues Bild ein noch gesperrtes Vorlagen-Bild, hört «Szene erzeugen» an — deutsche Meldung mit Bildnummer, markiertes Päckchen, dann «Szene weiter erzeugen».
- **Stammbilder:** Regie vergleicht Katalog-Stammbild mit Regiebuch; bei Abweichung «Stammbild neu zeichnen» im Regiebuch. An den Maler geht nur ein geprüftes Stammbild. **Höchstens zwei automatische Neuzeichnungen** je Person und Lauf — danach hält «Szene erzeugen» an mit deutscher Meldung (Regiebuch oder Katalog). Vorbereitung zeigt «Stammbild …», nicht «Bild 0». «Anhalten» bricht auch die laufende Anfrage ab; Schritte über 120 s sagen Zeitlimit.
- **Druckansicht (kompakt, live auf main):** Adresse `…/dialog/<Geschichte>/board/druck` (alte `…/druck` leitet um). Auf Bilder oben «Druckansicht», je Szene mit Seitenschätzung und denselben Knöpfen «Alle Details aufklappen / zuklappen». Standard ist kompakt: kleine Bilder (~300 px), knappe Schrift, oft zwei Spalten; Regie-Verlauf je Versuch eine Zeile. «Ausführlich drucken» nur mit Haken (volle Prompts). **Stammbild:** im Regiebuch «Stammbild passt nicht — neu zeichnen», wenn Kleidung nicht zum Buch passt. **Handlung / Regie / Ton** unter jedem Bild: kleine Felder, wachsen mit dem Text (nicht mehr die hohe Standard-Box).

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
- **28. Nov.:** Nach «Raumbild/Gesamtschau» war login und Startseite tot (Fehler «Server-Zeitlimit» — in Wahrheit startete die API gar nicht). Fix auf main, `check-api-boot.ts` vor Deploy.
- **Nicht mergen**, bis Jean-Marie ja sagt.
