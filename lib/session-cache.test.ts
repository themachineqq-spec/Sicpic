import { afterEach, describe, expect, it } from 'vitest'
import { invalidateSessionCache, readSessionCache, resetSessionCache, writeSessionCache } from '@/lib/session-cache'

function installStorage() {
  const values = new Map<string, string>()
  const store = {
    get length() {
      return values.size
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    },
    clear() {
      values.clear()
    },
  }
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: store })
  return values
}

describe('session cache', () => {
  afterEach(() => {
    resetSessionCache()
    Reflect.deleteProperty(globalThis, 'sessionStorage')
  })

  it('shows stale data and drops a prefix from memory and session storage', () => {
    const values = installStorage()
    writeSessionCache('gallery:group:all:::', { photos: [{ id: 'a' }] }, 1_000)
    writeSessionCache('members', [{ id: 'ada' }], 1_000)
    expect(readSessionCache('gallery:group:all:::', 1_000)?.stale).toBe(false)
    resetSessionCache()
    expect(readSessionCache<{ photos: { id: string }[] }>('gallery:group:all:::', 40_000)?.data.photos[0]?.id).toBe('a')
    expect(readSessionCache('gallery:group:all:::', 40_000)?.stale).toBe(true)
    invalidateSessionCache('gallery:')
    expect(readSessionCache('gallery:group:all:::')).toBeNull()
    expect(readSessionCache('members')?.data).toEqual([{ id: 'ada' }])
    expect([...values.keys()].some((key) => key.includes('gallery:'))).toBe(false)
    expect([...values.keys()].some((key) => key.endsWith('members'))).toBe(true)
  })

  it('keeps working when session storage throws', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        get length() {
          return 0
        },
        key: () => null,
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('full')
        },
        removeItem: () => {
          throw new Error('blocked')
        },
      },
    })
    writeSessionCache('gallery:mine:all:::', { photos: [] }, 5)
    expect(readSessionCache('gallery:mine:all:::', 5)?.stale).toBe(false)
    invalidateSessionCache('gallery:')
    expect(readSessionCache('gallery:mine:all:::')).toBeNull()
  })
})
