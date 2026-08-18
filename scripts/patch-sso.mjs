import { readFileSync, writeFileSync } from "fs";

let api = readFileSync("api/[...slug].ts", "utf8");
const marker = "if ((route === 'sync' || route === 'auth/sync') && req.method === 'POST')";
if (!api.includes("route === 'hub-sso'")) {
  const insert = `
    if (route === 'hub-sso' && req.method === 'POST') {
      const expected = process.env.HUB_SSO_SECRET?.trim()
      if (!expected) {
        res.status(503).json({ error: 'HUB_SSO_SECRET nicht konfiguriert.' })
        return
      }
      const body = req.body as { secret?: string; email?: string; name?: string }
      if (!body.secret || body.secret !== expected) {
        res.status(401).json({ error: 'Ungültiges SSO-Geheimnis.' })
        return
      }
      const email = body.email?.trim().toLowerCase()
      if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'E-Mail fehlt.' })
        return
      }
      const displayName = body.name?.trim() || email

      let uid: string
      try {
        const existing = await adminAuth().getUserByEmail(email)
        uid = existing.uid
        if (displayName && existing.displayName !== displayName) {
          await adminAuth().updateUser(uid, { displayName })
        }
      } catch {
        const created = await adminAuth().createUser({
          email,
          displayName,
          emailVerified: true,
        })
        uid = created.uid
      }

      const profile = await upsertUserProfile(uid, {
        name: displayName,
        email,
        authType: 'google',
      })
      const customToken = await adminAuth().createCustomToken(uid, {
        src: 'zebotools',
      })
      res.json({
        customToken,
        user: await enrichClientUser(profile),
      })
      return
    }

    if (route === 'public-shared' && req.method === 'GET') {
      const { adminDb } = await import('../lib/firebase-admin.js')
      const snap = await adminDb()
        .collection('dialogs')
        .where('shareToken', '!=', null)
        .limit(60)
        .get()
      const items = snap.docs
        .map((doc) => {
          const d = doc.data()
          const token = d.shareToken as string | null | undefined
          if (!token) return null
          return {
            id: doc.id,
            title: (d.title as string) || 'Dialog',
            sourceLanguage: d.sourceLanguage as string | undefined,
            targetLanguage: d.targetLanguage as string | undefined,
            shareToken: token,
            updatedAt: d.updatedAt as string | undefined,
          }
        })
        .filter(Boolean)
      res.json({ items })
      return
    }

    `;
  if (!api.includes(marker)) throw new Error("marker missing");
  api = api.replace(marker, insert + marker);
  writeFileSync("api/[...slug].ts", api);
  console.log("api patched");
} else {
  console.log("api already patched");
}

const appPath = "src/App.tsx";
let app = readFileSync(appPath, "utf8");
if (!app.includes("SsoPage")) {
  app = app.replace(
    "import { ProPage } from './pages/ProPage'",
    `import { ProPage } from './pages/ProPage'
import { SsoPage } from './pages/SsoPage'
import { PublicHomePage } from './pages/PublicHomePage'
import { useAuth } from './context/AuthContext'`,
  );

  const homeSwitch = `
function HomeSwitch() {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted" style={{ padding: '2rem' }}>Laden …</p>
  if (!user) return <PublicHomePage />
  return (
    <Layout>
      <DashboardPage />
    </Layout>
  )
}

`;
  app = app.replace("function AppRoutes()", homeSwitch + "function AppRoutes()");

  app = app.replace(
    `<Route element={<ProtectedRoute />}>
        <Route
          path="/"
          element={
            <Layout>
              <DashboardPage />
            </Layout>
          }
        />`,
    `<Route path="/sso" element={<SsoPage />} />
      <Route path="/explore" element={<PublicHomePage />} />

      <Route path="/" element={<HomeSwitch />} />

      <Route element={<ProtectedRoute />}>`,
  );
  writeFileSync(appPath, app);
  console.log("app patched");
} else {
  console.log("app already patched");
}
