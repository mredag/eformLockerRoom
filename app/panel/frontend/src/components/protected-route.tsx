import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/auth-context'
import { Loading } from '@/components/loading'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <Loading />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
