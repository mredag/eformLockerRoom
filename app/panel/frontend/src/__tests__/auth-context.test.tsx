import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { apiClient } from '@/services/api-client'

// Mock API client
vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

// Test component to access auth context
function TestComponent() {
  const { user, isLoading, isAuthenticated, login, logout, checkAuth, refreshSession } = useAuth()
  
  return (
    <div>
      <div data-testid="loading">{isLoading.toString()}</div>
      <div data-testid="authenticated">{isAuthenticated.toString()}</div>
      <div data-testid="user">{user ? user.username : 'null'}</div>
      <button onClick={() => login('testuser', 'password')}>Login</button>
      <button onClick={logout}>Logout</button>
      <button onClick={checkAuth}>Check Auth</button>
      <button onClick={refreshSession}>Refresh</button>
    </div>
  )
}

describe('AuthProvider', () => {
  const mockUser = {
    id: '1',
    username: 'testuser',
    role: 'admin',
    email: 'test@example.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Clear any existing timers
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should initialize with loading state', async () => {
    const mockGet = vi.mocked(apiClient.get)
    mockGet.mockResolvedValueOnce(mockUser)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    expect(screen.getByTestId('user')).toHaveTextContent('null')

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(mockGet).toHaveBeenCalledWith('/auth/me', { skipErrorToast: true })
  })

  it('should authenticate user successfully', async () => {
    const mockGet = vi.mocked(apiClient.get)
    const mockPost = vi.mocked(apiClient.post)
    
    // Initial auth check fails
    mockGet.mockRejectedValueOnce(new Error('Not authenticated'))
    // Login succeeds
    mockPost.mockResolvedValueOnce({ success: true })
    // Auth check after login succeeds
    mockGet.mockResolvedValueOnce(mockUser)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    await act(async () => {
      screen.getByText('Login').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
      expect(screen.getByTestId('user')).toHaveTextContent('testuser')
    })

    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      username: 'testuser',
      password: 'password',
    })
  })

  it('should handle login failure', async () => {
    const mockGet = vi.mocked(apiClient.get)
    const mockPost = vi.mocked(apiClient.post)
    
    // Initial auth check fails
    mockGet.mockRejectedValueOnce(new Error('Not authenticated'))
    // Login fails
    mockPost.mockRejectedValueOnce(new Error('Invalid credentials'))

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    await expect(async () => {
      await act(async () => {
        screen.getByText('Login').click()
      })
    }).rejects.toThrow('Invalid credentials')

    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
  })

  it('should logout user successfully', async () => {
    const mockGet = vi.mocked(apiClient.get)
    const mockPost = vi.mocked(apiClient.post)
    
    // Initial auth check succeeds
    mockGet.mockResolvedValueOnce(mockUser)
    // Logout succeeds
    mockPost.mockResolvedValueOnce({ success: true })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    await act(async () => {
      screen.getByText('Logout').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
      expect(screen.getByTestId('user')).toHaveTextContent('null')
    })

    expect(mockPost).toHaveBeenCalledWith('/auth/logout', {}, { skipErrorToast: true })
  })

  it('should refresh session automatically', async () => {
    const mockGet = vi.mocked(apiClient.get)
    const mockPost = vi.mocked(apiClient.post)
    
    // Initial auth check succeeds
    mockGet.mockResolvedValueOnce(mockUser)
    // Session refresh succeeds
    mockPost.mockResolvedValueOnce({ success: true })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    // Fast-forward to trigger session refresh (15 minutes)
    await act(async () => {
      vi.advanceTimersByTime(15 * 60 * 1000)
    })

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/refresh', {}, { skipErrorToast: true })
    })
  })

  it('should handle session refresh failure', async () => {
    const mockGet = vi.mocked(apiClient.get)
    const mockPost = vi.mocked(apiClient.post)
    const { toast } = await import('sonner')
    
    // Initial auth check succeeds
    mockGet.mockResolvedValueOnce(mockUser)
    // Session refresh fails with 401
    const refreshError = new Error('Session expired')
    ;(refreshError as any).status = 401
    mockPost.mockRejectedValueOnce(refreshError)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    // Manually trigger refresh
    await act(async () => {
      screen.getByText('Refresh').click()
    })

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    })

    expect(toast.error).toHaveBeenCalledWith('Session expired. Please log in again.')
  })

  it('should handle page visibility changes', async () => {
    const mockGet = vi.mocked(apiClient.get)
    const mockPost = vi.mocked(apiClient.post)
    
    // Initial auth check succeeds
    mockGet.mockResolvedValueOnce(mockUser)
    // Session refresh succeeds
    mockPost.mockResolvedValueOnce({ success: true })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    // Simulate page becoming visible
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
      })
      
      const event = new Event('visibilitychange')
      document.dispatchEvent(event)
    })

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/refresh', {}, { skipErrorToast: true })
    })
  })

  it('should handle window focus events', async () => {
    const mockGet = vi.mocked(apiClient.get)
    const mockPost = vi.mocked(apiClient.post)
    
    // Initial auth check succeeds
    mockGet.mockResolvedValueOnce(mockUser)
    // Session refresh succeeds
    mockPost.mockResolvedValueOnce({ success: true })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    // Simulate window focus
    await act(async () => {
      const event = new Event('focus')
      window.dispatchEvent(event)
    })

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/refresh', {}, { skipErrorToast: true })
    })
  })
})