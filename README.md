# Zebla

Sprachlern-App zum Erstellen, Übersetzen und Üben von Dialogen – mit KI.

**Cloud-Stack:** [Vercel](https://vercel.com) (Hosting + API) · [Firebase Auth](https://firebase.google.com/products/auth) · [Firestore](https://firebase.google.com/products/firestore) · OpenAI

## Funktionen

- Anmeldung mit **Google** oder **Schülercode** (ohne Passwort)
- Dialoge per KI-Gespräch, Thema oder Diktat erstellen
- Übersetzen, Birkenbihl-Methode, Abschnitte, KI-Bilder
- Diashow mit Vorlesen und Wort-Markierung

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

---

## 2. Lokal entwickeln

```bash
npm install
cp .env.example .env
# .env ausfüllen (Firebase + OPENAI_API_KEY)
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
| `OPENAI_API_KEY` | Server |
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
├── lib/              # Firebase Admin, Firestore, OpenAI
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

- **DALL-E-Bilder:** URLs von OpenAI laufen nach einiger Zeit ab. Für dauerhafte Speicherung später Firebase Storage ergänzen.
- **Kosten:** OpenAI (GPT + DALL-E) und Firebase (Free Tier reicht für Tests) können Kosten verursachen.
- **Schülercodes:** Werden nur serverseitig geprüft (nicht aus Firestore-Client lesbar).
