import { toast } from 'sonner'

export interface ApiError {
  message: string
  status: number
  code?: string
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  retryCondition?: (error: ApiClientError) => boolean
}

interface RequestConfig extends RequestInit {
  retry?: Partial<RetryConfig>
  skipErrorToast?: boolean
}

class ApiClient {
  private baseURL: string
  private defaultRetryConfig: RetryConfig

  constructor(baseURL = '') {
    this.baseURL = baseURL
    this.defaultRetryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      retryCondition: (error) => {
        // Retry on network errors and 5xx server errors
        return error.status >= 500 || error.status === 0
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt)
    const jitter = Math.random() * 0.1 * exponentialDelay
    return Math.min(exponentialDelay + jitter, maxDelay)
  }

  private async handleResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type')
    const isJson = contentType?.includes('application/json')

    let data: any
    try {
      data = isJson ? await response.json() : await response.text()
    } catch (error) {
      data = null
    }

    if (!response.ok) {
      const message = data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`
      throw new ApiClientError(message, response.status, data?.code)
    }

    return data
  }

  private async makeRequest(
    url: string,
    config: RequestConfig = {}
  ): Promise<any> {
    const { retry = {}, skipErrorToast = false, ...fetchConfig } = config
    const retryConfig = { ...this.defaultRetryConfig, ...retry }
    
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`
    
    // Default headers
    const headers = {
      'Content-Type': 'application/json',
      ...fetchConfig.headers,
    }

    // Always include credentials for session management
    const requestConfig: RequestInit = {
      credentials: 'include',
      ...fetchConfig,
      headers,
    }

    let lastError: ApiClientError | null = null

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const response = await fetch(fullUrl, requestConfig)
        return await this.handleResponse(response)
      } catch (error) {
        if (error instanceof ApiClientError) {
          lastError = error
        } else {
          // Network or other errors
          lastError = new ApiClientError(
            error instanceof Error ? error.message : 'Network error',
            0
          )
        }

        // Don't retry on the last attempt or if retry condition is not met
        if (attempt === retryConfig.maxRetries || !retryConfig.retryCondition!(lastError)) {
          break
        }

        // Wait before retrying
        const delay = this.calculateDelay(attempt, retryConfig.baseDelay, retryConfig.maxDelay)
        await this.sleep(delay)
      }
    }

    // Show error toast unless explicitly disabled
    if (!skipErrorToast && lastError) {
      toast.error(lastError.message)
    }

    throw lastError || new ApiClientError('Unknown error', 0)
  }

  // HTTP methods
  async get(url: string, config?: RequestConfig): Promise<any> {
    return this.makeRequest(url, { ...config, method: 'GET' })
  }

  async post(url: string, data?: any, config?: RequestConfig): Promise<any> {
    return this.makeRequest(url, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : null,
    })
  }

  async put(url: string, data?: any, config?: RequestConfig): Promise<any> {
    return this.makeRequest(url, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : null,
    })
  }

  async patch(url: string, data?: any, config?: RequestConfig): Promise<any> {
    return this.makeRequest(url, {
      ...config,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : null,
    })
  }

  async delete(url: string, config?: RequestConfig): Promise<any> {
    return this.makeRequest(url, { ...config, method: 'DELETE' })
  }

  // File upload method
  async upload(url: string, formData: FormData, config?: RequestConfig): Promise<any> {
    const { headers = {}, ...restConfig } = config || {}
    
    // Don't set Content-Type for FormData - let browser set it with boundary
    const uploadHeaders = { ...headers } as Record<string, string>
    delete uploadHeaders['Content-Type']

    return this.makeRequest(url, {
      ...restConfig,
      method: 'POST',
      headers: uploadHeaders,
      body: formData,
    })
  }
}

// Create and export a default instance
export const apiClient = new ApiClient()

// Export the class for custom instances
export { ApiClient }