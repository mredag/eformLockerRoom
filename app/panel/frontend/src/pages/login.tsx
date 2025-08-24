import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/contexts/auth-context'
import { useI18n } from '@/hooks/useI18n'
import { LanguageSelector } from '@/components/language-selector'
import { ApiClientError } from '@/services/api-client'
import { toast } from 'sonner'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attemptCount, setAttemptCount] = useState(0)
  
  const { login, isAuthenticated } = useAuth()
  const { t } = useI18n()
  const location = useLocation()

  // Get the intended destination from location state
  const from = location.state?.from?.pathname || '/'

  // Redirect if already logged in
  if (isAuthenticated) {
    return <Navigate to={from} replace />
  }

  // Clear error when user starts typing
  useEffect(() => {
    if (error && (username || password)) {
      setError(null)
    }
  }, [username, password, error])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Client-side validation
    if (!username.trim()) {
      setError(t('auth.usernameRequired'))
      return
    }

    if (!password) {
      setError(t('auth.passwordRequired'))
      return
    }

    setIsLoading(true)
    setAttemptCount(prev => prev + 1)

    try {
      await login(username.trim(), password)
      toast.success(t('auth.loginSuccess'))
      // Navigation will happen automatically via the Navigate component above
    } catch (error) {
      let errorMessage = t('auth.loginError')
      
      if (error instanceof ApiClientError) {
        switch (error.status) {
          case 401:
            errorMessage = t('auth.invalidCredentials')
            break
          case 429:
            errorMessage = t('auth.tooManyAttempts')
            break
          case 403:
            errorMessage = t('auth.accountLocked')
            break
          case 500:
            errorMessage = t('auth.serverError')
            break
          default:
            errorMessage = error.message || t('auth.loginError')
        }
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>
      
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">eForm Locker Panel</CardTitle>
          <CardDescription>
            {t('auth.loginDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                {t('auth.username')}
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                disabled={isLoading}
                required
                autoComplete="username"
                className={error && !username.trim() ? 'border-destructive' : ''}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  disabled={isLoading}
                  required
                  autoComplete="current-password"
                  className={error && !password ? 'border-destructive pr-10' : 'pr-10'}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={togglePasswordVisibility}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  </span>
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('auth.loggingIn')}
                </>
              ) : (
                t('auth.loginButton')
              )}
            </Button>

            {attemptCount > 2 && (
              <div className="text-center text-sm text-muted-foreground">
                {t('auth.troubleLoggingIn')}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
