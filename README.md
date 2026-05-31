# Zebla

Sprachlern-App zum Erstellen, Übersetzen und Üben von Dialogen – mit KI.

**Cloud-Stack:** [Vercel](https://vercel.com) (Hosting + API) · [Firebase Auth](https://firebase.google.com/products/auth) · [Firestore](https://firebase.google.com/products/firestore) · [Google Gemini](https://aistudio.google.com)

## Funktionen

- Anmeldung mit **Google** oder **Schülercode** (ohne Passwort)
- Dialoge per KI-Gespräch, Thema oder Diktat erstellen
- Übersetzen, Birkenbihl-Methode, Abschnitte, KI-Bilder
- Diashow mit Vorlesen und Wort-Markierung
- **Cloud-Sprachausgabe** (Google Text-to-Speech) – natürliche Stimmen auch für Persisch/Dari, ohne Windows-Sprachpaket

---

## 1. Firebase einrichten

1. [Firebase Console](https://console.firebase.google.com/) → Neues Projekt
2. **Authentication** aktivieren → Anbieter **Google** einschalten
3. **Firestore** erstellen (Production-Modus)
4. **Web-App** registrieren → Config-Werte notieren (`apiKey`, `authDomain`, `projectId`, `appId`)
5. **Projekteinstellungen → Dienstkonten** → Neuen privaten Schlüssel generieren (JSON)

Firestore-Regeln deployen (Firebase CLI):

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # firestore.rules & firestore.indexes.json auswählen
firebase deploy --only firestore:rules,firestore:indexes
```

Schülercodes seeden:

```bash
cp .env.example .env
# Firebase Admin-Werte aus dem JSON eintragen
npm run seed
```

Demo-Codes: `DEMO123`, `KLASSE7A`, `SCHUELER2024`

### Cloud-Sprachausgabe (empfohlen für Persisch/Dari)

1. [Cloud Text-to-Speech API](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com) aktivieren (Deutsch, Französisch, …)
2. **[Vertex AI API](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com)** aktivieren – **nötig für Persisch/Dari** (Gemini-TTS, kein klassisches `fa-IR`-Stimmenpaket)
3. Abrechnungskonto im Google-Projekt verknüpft (Blaze/Firebase reicht oft)
4. Dem **Firebase-Service-Account** (`FIREBASE_CLIENT_EMAIL` auf Vercel) die IAM-Rolle **[Vertex AI User](https://console.cloud.google.com/iam-admin/iam?project=zebla-f517e)** geben – sonst schlägt Gemini-TTS mit fehlender Berechtigung `aiplatform.endpoints.predict` fehl

Zebla nutzt die vorhandenen `FIREBASE_*`-Zugangsdaten. In der Diashow: **„☁️ Cloud-Sprachausgabe“** wenn alles funktioniert; bei Problemen erscheint eine **rote Fehlermeldung** mit Hinweis.

**Kosten (grobe Orientierung):** APIs aktivieren ist kostenlos. Pro Dialogzeile fällt einmalig Cloud-TTS an (typisch wenige Cent pro kompletten Dialog mit ~20 Zeilen). Beim **Wiederabspielen** wird das gespeicherte MP3 aus Firebase Storage geladen – **keine erneute TTS-Abrechnung**. Storage/Firestore sind vernachlässigbar klein.

**Audio-Cache:** Jede Zeile bekommt beim ersten Mal eine MP3 in Storage (`audioUrl` am Dialog). Diashow: **„Audio vorbereiten“** erzeugt alle fehlenden Dateien auf einmal; **MP3-ZIP** / **Gesamt-Audio (WAV)** zum Download.

---

## 2. Lokal entwickeln

```bash
npm install
cp .env.example .env
# .env ausfüllen (Firebase + GEMINI_API_KEY)
npm run seed
npm run dev
```

`npm run dev` startet [Vercel Dev](https://vercel.com/docs/cli/dev) – Frontend und API unter http://localhost:3000

Alternativ nur Frontend:

```bash
npm run dev:client
```

(API-Routen brauchen dann `vercel dev` oder Deployment)

---

## 3. Auf Vercel deployen

1. Repo auf GitHub pushen
2. [vercel.com](https://vercel.com) → **Import Project**
3. Framework: **Vite** (wird automatisch erkannt)
4. **Environment Variables** setzen:

| Variable | Wo |
|----------|-----|
| `GEMINI_API_KEY` | Server (Google AI Studio, eigener Key „zebla“) |
| `FIREBASE_PROJECT_ID` | Server |
| `FIREBASE_CLIENT_EMAIL` | Server |
| `FIREBASE_PRIVATE_KEY` | Server (kompletter Key mit `\n`) |
| `VITE_FIREBASE_API_KEY` | Client |
| `VITE_FIREBASE_AUTH_DOMAIN` | Client |
| `VITE_FIREBASE_PROJECT_ID` | Client |
| `VITE_FIREBASE_APP_ID` | Client |

5. Deploy klicken

### Google-Anmeldung in Production

In Firebase Console → Authentication → Google → **Autorisierte Domains** hinzufügen:

- `dein-projekt.vercel.app`
- Eigene Domain (falls vorhanden)

---

## Projektstruktur

```
Zebla/
├── api/              # Vercel Serverless Functions
├── lib/              # Firebase Admin, Firestore, Gemini
├── shared/           # TypeScript-Typen
├── src/              # React Frontend
├── firestore.rules
└── vercel.json
```

## Skripte

| Befehl | Beschreibung |
|--------|--------------|
| `npm run dev` | Vercel Dev (Frontend + API) |
| `npm run build` | Production-Build |
| `npm run seed` | Demo-Schülercodes in Firestore |
| `npm run lint` | ESLint |

## Hinweise

- **KI-Bilder:** Werden als Base64 im Dialog gespeichert. Für dauerhafte Speicherung später Firebase Storage ergänzen.
- **Kosten:** Google Gemini (eigener API-Key „zebla“) und Firebase – Nutzung getrennt von anderen Apps trackbar.
- **Schülercodes:** Werden nur serverseitig geprüft (nicht aus Firestore-Client lesbar).
