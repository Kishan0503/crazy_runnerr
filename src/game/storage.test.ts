import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBest, loadWallet, saveBest, saveWallet } from './storage'

/** Minimal in-memory localStorage stand-in (the tests run in node). */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
}

/** localStorage that throws on every access (private mode / blocked storage). */
const throwingStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('best distance / wallet persistence', () => {
  it('returns 0 when nothing is stored', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadBest()).toBe(0)
    expect(loadWallet()).toBe(0)
  })

  it('round-trips and floors saved values', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    saveBest(1234.9)
    saveWallet(56.7)
    expect(loadBest()).toBe(1234)
    expect(loadWallet()).toBe(56)
  })

  it('treats garbage or negative values as 0', () => {
    const store = memoryStorage()
    vi.stubGlobal('localStorage', store)
    store.setItem('lane-runner:best-distance', 'not-a-number')
    store.setItem('lane-runner:coins', '-50')
    expect(loadBest()).toBe(0)
    expect(loadWallet()).toBe(0)
  })

  it('degrades gracefully when storage throws', () => {
    vi.stubGlobal('localStorage', throwingStorage)
    expect(loadBest()).toBe(0)
    expect(loadWallet()).toBe(0)
    expect(() => saveBest(100)).not.toThrow()
    expect(() => saveWallet(100)).not.toThrow()
  })
})
