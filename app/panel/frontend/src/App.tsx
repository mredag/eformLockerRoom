import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/contexts/theme-context'
import { AuthProvider } from '@/contexts/auth-context'
import { I18nProvider } from '@/contexts/i18n-context'
import { ErrorBoundary } from '@/components/error-boundary'
import { ProtectedRoute } from '@/components/protected-route'
import { Layout } from '@/components/layout/layout'
import { Login } from '@/pages/login'
import { Dashboard } from '@/pages/dashboard'
import { Lockers } from '@/pages/lockers'
import { Help } from '@/pages/help'
import { VIP } from '@/pages/vip'
import { Reports } from '@/pages/reports'
import Settings from '@/pages/settings'
import { Users } from '@/pages/users'

function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider defaultTheme="system" storageKey="ui-theme">
          <AuthProvider>
            <Router>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="lockers" element={<Lockers />} />
                  <Route path="help" element={<Help />} />
                  <Route path="vip" element={<VIP />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="users" element={<Users />} />
                </Route>
              </Routes>
            </Router>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  )
}

export default App
