import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiClient, ApiClient, ApiClientError } from '@/services/api-client'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('ApiClient', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('successful requests', () => {
    it('should make a GET request successfully', async () => {
      const mockData = { id: 1, name: 'test' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockData,
      })

      const result = await apiClient.get('/test')

      expect(mockFetch).toHaveBeenCalledWith('/test', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      expect(result).toEqual(mockData)
    })

    it('should make a POST request with data', async () => {
      const mockData = { success: true }
      const postData = { name: 'test' }
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockData,
      })

      const result = await apiClient.post('/test', postData)

      expect(mockFetch).toHaveBeenCalledWith('/test', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      })
      expect(result).toEqual(mockData)
    })

    it('should handle file uploads', async () => {
      const mockData = { url: 'uploaded-file-url' }
      const formData = new FormData()
      formData.append('file', new Blob(['test']), 'test.txt')
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockData,
      })

      const result = await apiClient.upload('/upload', formData)

      expect(mockFetch).toHaveBeenCalledWith('/upload', {
        method: 'POST',
        credentials: 'include',
        headers: {},
        body: formData,
      })
      expect(result).toEqual(mockData)
    })
  })

  describe('error handling', () => {
    it('should throw ApiClientError for HTTP errors', async () => {
      const errorData = { message: 'Not found' }
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => errorData,
      })

      await expect(apiClient.get('/test')).rejects.toThrow(ApiClientError)
      await expect(apiClient.get('/test')).rejects.toThrow('Not found')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(apiClient.get('/test')).rejects.toThrow(ApiClientError)
      await expect(apiClient.get('/test')).rejects.toThrow('Network error')
    })

    it('should skip error toast when requested', async () => {
      const { toast } = await import('sonner')
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ message: 'Server error' }),
      })

      await expect(
        apiClient.get('/test', { skipErrorToast: true })
      ).rejects.toThrow(ApiClientError)

      expect(toast.error).not.toHaveBeenCalled()
    })
  })

  describe('retry logic', () => {
    it('should retry on 5xx errors', async () => {
      // First call fails with 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ message: 'Server error' }),
      })

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true }),
      })

      const result = await apiClient.get('/test', {
        retry: { maxRetries: 1, baseDelay: 10 }
      })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result).toEqual({ success: true })
    })

    it('should not retry on 4xx errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ message: 'Not found' }),
      })

      await expect(
        apiClient.get('/test', { retry: { maxRetries: 3 } })
      ).rejects.toThrow(ApiClientError)

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('custom configuration', () => {
    it('should allow custom base URL', () => {
      const customClient = new ApiClient('https://api.example.com')
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true }),
      })

      customClient.get('/test')

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/test', expect.any(Object))
    })

    it('should handle absolute URLs', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true }),
      })

      apiClient.get('https://external-api.com/test')

      expect(mockFetch).toHaveBeenCalledWith('https://external-api.com/test', expect.any(Object))
    })
  })
})