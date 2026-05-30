import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { CreateDialogPage } from './pages/CreateDialogPage'
import { DialogEditorPage } from './pages/DialogEditorPage'
import { SlideshowPage } from './pages/SlideshowPage'

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

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
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
