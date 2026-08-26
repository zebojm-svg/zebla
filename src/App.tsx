import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { I18nProvider } from './i18n/I18nContext'
import { Layout } from './components/Layout'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { CreateDialogPage } from './pages/CreateDialogPage'
import { DialogEditorPage } from './pages/DialogEditorPage'
import { SlideshowPage } from './pages/SlideshowPage'
import { ShareImportPage } from './pages/ShareImportPage'
import { StoryPlayerPage } from './story/StoryPlayerPage'
import { FilmStoryboardPage } from './story/FilmStoryboardPage'
import { FilmLibraryPage } from './story/FilmLibraryPage'
import { FilmExportPage } from './story/FilmExportPage'
import { ClassesPage } from './pages/ClassesPage'
import { ProPage } from './pages/ProPage'
import { SsoPage } from './pages/SsoPage'
import { PublicHomePage } from './pages/PublicHomePage'
import { useAuth } from './context/AuthContext'


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

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route path="/share/:token" element={<ShareImportPage />} />

      <Route path="/sso" element={<SsoPage />} />
      <Route path="/explore" element={<PublicHomePage />} />

      <Route path="/" element={<HomeSwitch />} />

      <Route element={<ProtectedRoute />}>
        <Route
          path="/classes"
          element={
            <Layout>
              <ClassesPage />
            </Layout>
          }
        />
        <Route
          path="/pro"
          element={
            <Layout>
              <ProPage />
            </Layout>
          }
        />
        <Route
          path="/create"
          element={
            <Layout>
              <CreateDialogPage />
            </Layout>
          }
        />
        <Route
          path="/dialog/:id"
          element={
            <Layout>
              <DialogEditorPage />
            </Layout>
          }
        />
        <Route path="/dialog/:id/slideshow" element={<SlideshowPage />} />
        <Route
          path="/dialog/:id/board"
          element={
            <Layout>
              <FilmStoryboardPage />
            </Layout>
          }
        />
        <Route
          path="/dialog/:id/export"
          element={
            <Layout>
              <FilmExportPage />
            </Layout>
          }
        />
        <Route
          path="/library"
          element={
            <Layout>
              <FilmLibraryPage />
            </Layout>
          }
        />
        <Route
          path="/story"
          element={
            <Layout>
              <StoryPlayerPage />
            </Layout>
          }
        />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  )
}
