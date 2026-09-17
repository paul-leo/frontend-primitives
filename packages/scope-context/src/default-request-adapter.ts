import { serializeCacheKey } from './cache-key'
import type { ScopeCacheAdapter, ScopeCacheKey, ScopeRequestAdapter } from './types'

export interface FetchRequestAdapterOptions {
  /** Injectable HTTP client — defaults to the global fetch. */
  baseFetch?: typeof fetch
}

/**
 * Zero-dependency request adapter: raw fetch for uncached calls, plus a cache-backed `query()`
 * that dedupes concurrent calls for the same key and writes results into the exact `cache`
 * instance it was constructed with.
 */
export function createFetchRequestAdapter(
  options: FetchRequestAdapterOptions = {},
): (scopeId: string, cache: ScopeCacheAdapter) => ScopeRequestAdapter {
  const baseFetch = options.baseFetch ?? globalThis.fetch

  return (_scopeId, cache) => {
    const inFlight = new Map<string, Promise<unknown>>()

    return {
      fetch(input, init) {
        return baseFetch(input, init)
      },
      async query<T>(key: ScopeCacheKey, fetcher: (signal: AbortSignal) => Promise<T>): Promise<T> {
        const cached = cache.get<T>(key)
        if (cached !== undefined) return cached

        const serialized = serializeCacheKey(key)
        const existing = inFlight.get(serialized) as Promise<T> | undefined
        if (existing) return existing

        const controller = new AbortController()
        const promise = fetcher(controller.signal)
          .then((value) => {
            cache.set(key, value)
            return value
          })
          .finally(() => {
            inFlight.delete(serialized)
          })
        inFlight.set(serialized, promise)
        return promise
      },
    }
  }
}
