import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { AuthGuard } from '@/components/AuthGuard'
import { Layout } from '@/components/Layout'
import { Toaster } from '@/components/ui/toaster'
import LoginPage from '@/pages/Login'
import SignupPage from '@/pages/Signup'
import DashboardPage from '@/pages/Dashboard'
import AdminPage from '@/pages/Admin'
import ResultsPage from '@/pages/Results'
import ParentsPage from '@/pages/Parents'
import StudentsPage from '@/pages/Students'
import PortalSettingsPage from '@/pages/PortalSettings'

// Wrapper component that applies Layout to authenticated routes
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <Layout>{children}</Layout>
    </AuthGuard>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <AuthenticatedLayout>
                <DashboardPage />
              </AuthenticatedLayout>
            }
          />
          <Route
            path="/admin"
            element={
              <AuthenticatedLayout>
                <AdminPage />
              </AuthenticatedLayout>
            }
          />
          <Route
            path="/results"
            element={
              <AuthenticatedLayout>
                <ResultsPage />
              </AuthenticatedLayout>
            }
          />
          <Route
            path="/parents"
            element={
              <AuthenticatedLayout>
                <ParentsPage />
              </AuthenticatedLayout>
            }
          />
          <Route
            path="/students"
            element={
              <AuthenticatedLayout>
                <StudentsPage />
              </AuthenticatedLayout>
            }
          />
          <Route
            path="/portal"
            element={
              <AuthenticatedLayout>
                <PortalSettingsPage />
              </AuthenticatedLayout>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  )
}

export default App