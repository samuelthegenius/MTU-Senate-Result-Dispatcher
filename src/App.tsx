import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { AuthGuard } from '@/components/AuthGuard'
import { Layout } from '@/components/Layout'
import { Toaster } from '@/components/ui/toaster'
import { Loader2 } from 'lucide-react'

// Lazy load pages for code splitting
const LoginPage = lazy(() => import('@/pages/Login'))
const SignupPage = lazy(() => import('@/pages/Signup'))
const DashboardPage = lazy(() => import('@/pages/Dashboard'))
const AdminPage = lazy(() => import('@/pages/Admin'))
const ResultsPage = lazy(() => import('@/pages/Results'))
const ParentsPage = lazy(() => import('@/pages/Parents'))
const StudentsPage = lazy(() => import('@/pages/Students'))
const PortalSettingsPage = lazy(() => import('@/pages/PortalSettings'))

// Loading fallback for lazy-loaded routes
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-mtu-purple" />
    </div>
  )
}

// Wrapper component that applies Layout to authenticated routes
function AuthenticatedLayout({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  return (
    <AuthGuard requireAdmin={requireAdmin}>
      <Layout>{children}</Layout>
    </AuthGuard>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
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
              <AuthenticatedLayout requireAdmin>
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
              <AuthenticatedLayout requireAdmin>
                <PortalSettingsPage />
              </AuthenticatedLayout>
            }
          />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  )
}

export default App