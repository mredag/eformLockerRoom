// Simple integration test to verify API client works
import { apiClient } from './services/api-client'

async function testApiIntegration() {
  console.log('Testing API client integration...')
  
  try {
    // Test health endpoint (should not require auth)
    console.log('Testing health endpoint...')
    const healthResponse = await apiClient.get('/health', { skipErrorToast: true })
    console.log('Health response:', healthResponse)
    
    // Test auth/me endpoint (should return 401 when not authenticated)
    console.log('Testing auth/me endpoint...')
    try {
      const authResponse = await apiClient.get('/auth/me', { skipErrorToast: true })
      console.log('Auth response:', authResponse)
    } catch (error) {
      console.log('Expected auth error (not logged in):', error)
    }
    
    console.log('API client integration test completed successfully!')
    
  } catch (error) {
    console.error('API client integration test failed:', error)
  }
}

// Only run if this file is executed directly
if (typeof window === 'undefined') {
  testApiIntegration()
}

export { testApiIntegration }