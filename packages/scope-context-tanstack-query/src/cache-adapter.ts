import { QueryClient, type QueryClientConfig, type QueryKey } from '@tanstack/query-core'
import { normalizeCacheKey, type ScopeCacheAdapter, type ScopeCacheKey } from 'scope-context'

function toQueryKey(key: ScopeCacheKey): QueryKey {
  return normalizeCacheKey(key) as QueryKey
}

export interface TanStackQueryCacheAdapterOptions {
  queryClientOptions?: QueryClientConfig
}

/** One independent QueryClient per scope — isolation is a distinct object, not a shared client with prefixed keys. */
export function createTanStackQueryCacheAdapter(
  options: TanStackQueryCacheAdapterOptions = {},
): (scopeId: string) => ScopeCacheAdapter<QueryClient> {
  return () => {
    const client = new QueryClient(options.queryClientOptions)

    return {
      client,
      get<T>(key: ScopeCacheKey): T | undefined {
        return client.getQueryData<T>(toQueryKey(key))
      },
      set<T>(key: ScopeCacheKey, value: T): void {
        client.setQueryData<T>(toQueryKey(key), value)
      },
      invalidate(key, invalidateOptions) {
        void client.invalidateQueries({ queryKey: toQueryKey(key), exact: invalidateOptions?.exact ?? false })
      },
      clear() {
        client.clear()
      },
      dispose() {
        client.unmount()
      },
    }
  }
}
