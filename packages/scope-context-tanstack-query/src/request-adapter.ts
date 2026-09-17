import type { QueryClient } from '@tanstack/query-core'
import { normalizeCacheKey, type ScopeCacheAdapter, type ScopeCacheKey, type ScopeRequestAdapter } from 'scope-context'

/**
 * Must be paired with a cache adapter whose `.client` is a real `QueryClient` — in practice,
 * `createTanStackQueryCacheAdapter()` passed as the same ScopeContextOptions.createCache.
 * `query()` is the only method that touches the cache, and it does so through the exact
 * QueryClient the cache adapter it was constructed with holds — never a different scope's.
 */
export function createTanStackQueryRequestAdapter(): (scopeId: string, cache: ScopeCacheAdapter) => ScopeRequestAdapter {
  return (_scopeId, cache) => {
    const client = cache.client as QueryClient

    return {
      fetch(input, init) {
        return fetch(input, init)
      },
      query<T>(key: ScopeCacheKey, fetcher: (signal: AbortSignal) => Promise<T>): Promise<T> {
        return client.fetchQuery<T>({
          queryKey: normalizeCacheKey(key),
          queryFn: ({ signal }) => fetcher(signal),
        })
      },
    }
  }
}
