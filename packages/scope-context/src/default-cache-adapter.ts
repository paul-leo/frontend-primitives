import { isKeyPrefixMatch, normalizeCacheKey, serializeCacheKey } from './cache-key'
import type { ScopeCacheAdapter, ScopeCacheKey } from './types'

/** Zero-dependency in-memory cache adapter, keyed like TanStack Query's array query keys. */
export function createInMemoryCacheAdapter(): (scopeId: string) => ScopeCacheAdapter<Map<string, unknown>> {
  return () => {
    const store = new Map<string, unknown>()
    const keysBySerialized = new Map<string, unknown[]>()

    return {
      client: store,
      get<T>(key: ScopeCacheKey): T | undefined {
        return store.get(serializeCacheKey(key)) as T | undefined
      },
      set<T>(key: ScopeCacheKey, value: T): void {
        const serialized = serializeCacheKey(key)
        store.set(serialized, value)
        keysBySerialized.set(serialized, normalizeCacheKey(key))
      },
      invalidate(key, options) {
        if (options?.exact) {
          const serialized = serializeCacheKey(key)
          store.delete(serialized)
          keysBySerialized.delete(serialized)
          return
        }
        const prefix = normalizeCacheKey(key)
        for (const [serialized, candidate] of keysBySerialized) {
          if (isKeyPrefixMatch(candidate, prefix)) {
            store.delete(serialized)
            keysBySerialized.delete(serialized)
          }
        }
      },
      clear() {
        store.clear()
        keysBySerialized.clear()
      },
    }
  }
}
