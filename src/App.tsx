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
import { ExplorePage } from './pages/ExplorePage'

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route path="/share/:token" element={<ShareImportPage />} />

      <Route
        path="/explore"
        element={
          <Layout>
            <ExplorePage />
          </Layout>
        }
      />

      <Route element={<ProtectedRoute />}>
        <Route
          path="/"
          element={
            <Layout>
              <DashboardPage />
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
