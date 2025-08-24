import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Create a proper localStorage mock
class LocalStorageMock {
  private store: Record<string, string> = {}

  getItem(key: string): string | null {
    return this.store[key] || null
  }

  setItem(key: string, value: string): void {
    this.store[key] = value
  }

  removeItem(key: string): void {
    delete this.store[key]
  }

  clear(): void {
    this.store = {}
  }

  get length(): number {
    return Object.keys(this.store).length
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store)
    return keys[index] || null
  }
}

const localStorageMock = new LocalStorageMock()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock navigator.language
Object.defineProperty(navigator, 'language', {
  value: 'en-US',
  configurable: true,
})

// Reset localStorage before each test
beforeEach(() => {
  localStorageMock.clear()
})