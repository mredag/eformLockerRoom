import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { apiClient, ApiClientError } from '@/services/api-client'
import { toast } from 'sonner'

interface User {
  id: string
  username: string
  role: string
  email?: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Session refresh interval (15 minutes)
const SESSION_REFRESH_INTERVAL = 15 * 60 * 1000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isRefreshingRef = useRef(false)

  const clearRefreshInterval = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }
  }, [])

  const startRefreshInterval = useCallback(() => {
    clearRefreshInterval()
    refreshIntervalRef.current = setInterval(async () => {
      if (!isRefreshingRef.current && user) {
        await refreshSession()
      }
    }, SESSION_REFRESH_INTERVAL)
  }, [user])

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true)
      const userData = await apiClient.get('/auth/me', { skipErrorToast: true })
      setUser(userData)
      startRefreshInterval()
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        // Unauthorized - clear user state
        setUser(null)
        clearRefreshInterval()
      } else {
        console.error('Auth check failed:', error)
        // Don't clear user on network errors, keep existing state
      }
    } finally {
      setIsLoading(false)
    }
  }, [startRefreshInterval, clearRefreshInterval])

  const refreshSession = useCallback(async () => {
    if (isRefreshingRef.current) return

    try {
      isRefreshingRef.current = true
      await apiClient.post('/auth/refresh', {}, { skipErrorToast: true })
      // Session refreshed successfully, no need to update user data
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        // Session expired, force re-authentication
        setUser(null)
        clearRefreshInterval()
        toast.error('Session expired. Please log in again.')
      }
    } finally {
      isRefreshingRef.current = false
    }
  }, [clearRefreshInterval])

  const login = async (username: string, password: string) => {
    setIsLoading(true)
    try {
      await apiClient.post('/auth/login', { username, password })
      // After successful login, check auth to get user data
      await checkAuth()
    } catch (error) {
      setIsLoading(false)
      throw error
    }
  }

  const logout = async () => {
    try {
      clearRefreshInterval()
      await apiClient.post('/auth/logout', {}, { skipErrorToast: true })
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setUser(null)
      setIsLoading(false)
    }
  }

  // Handle page visibility changes to refresh session when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user && !isRefreshingRef.current) {
        refreshSession()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user, refreshSession])

  // Handle window focus to refresh session
  useEffect(() => {
    const handleFocus = () => {
      if (user && !isRefreshingRef.current) {
        refreshSession()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [user, refreshSession])

  // Initial auth check
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      clearRefreshInterval()
    }
  }, [clearRefreshInterval])

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    checkAuth,
    refreshSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
