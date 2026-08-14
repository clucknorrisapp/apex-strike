// Test harness: an in-memory localStorage so the storage-backed game modules (meta, rank, daily,
// heat, splits, contracts, rush, leaderboard) run under Node with no browser. The real modules read
// the `localStorage` global lazily inside function bodies, so installing it here — before any test
// runs — is enough. Cleared before every test so each case starts from a fresh device.
import { beforeEach } from 'vitest'

class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length(): number { return this.m.size }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null }
  getItem(k: string): string | null { return this.m.has(k) ? (this.m.get(k) as string) : null }
  setItem(k: string, v: string): void { this.m.set(String(k), String(v)) }
  removeItem(k: string): void { this.m.delete(k) }
  clear(): void { this.m.clear() }
}

const store = new MemStorage()
;(globalThis as unknown as { localStorage: Storage }).localStorage = store

beforeEach(() => store.clear())
