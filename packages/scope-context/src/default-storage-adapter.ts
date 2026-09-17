import type { ScopeStorageAdapter } from './types'

/**
 * Zero-dependency in-memory storage adapter — intentionally ephemeral (lost on reload), so it
 * never silently pretends to be durable. Swap in `scope-context-dexie` for real persistence.
 */
export function createInMemoryStorageAdapter(): (scopeId: string) => ScopeStorageAdapter<Map<string, string>> {
  return () => {
    const store = new Map<string, string>()
    return {
      client: store,
      async get(key) {
        return store.has(key) ? (store.get(key) as string) : null
      },
      async set(key, value) {
        store.set(key, value)
      },
      async delete(key) {
        store.delete(key)
      },
      async clear() {
        store.clear()
      },
    }
  }
}
