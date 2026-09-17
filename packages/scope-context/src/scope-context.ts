import { createBroadcastChannelCommsAdapter } from './default-comms-adapter'
import { createFetchRequestAdapter } from './default-request-adapter'
import { createInMemoryCacheAdapter } from './default-cache-adapter'
import { createInMemoryStorageAdapter } from './default-storage-adapter'
import { createStaticThemeAdapter } from './default-theme-adapter'
import type { ScopeContext, ScopeContextOptions } from './types'

export function createScopeContext<M = undefined>(
  scopeId: string,
  options: ScopeContextOptions<M> = {},
): ScopeContext<M> {
  const cache = (options.createCache ?? createInMemoryCacheAdapter())(scopeId)
  const storage = (options.createStorage ?? createInMemoryStorageAdapter())(scopeId)
  // `cache` here is always the RESOLVED cache above — there is no code path in which the
  // request adapter can end up holding a reference to a different scope's cache.
  const request = (options.createRequest ?? createFetchRequestAdapter())(scopeId, cache)
  const comms = (options.createComms ?? createBroadcastChannelCommsAdapter())(scopeId)
  const theme = (options.createTheme ?? createStaticThemeAdapter())(scopeId)
  const memory = (options.createMemory ?? (() => undefined as M))(scopeId)

  return {
    scopeId,
    storage,
    cache,
    request,
    comms,
    theme,
    memory,
    async destroy() {
      await Promise.all([
        storage.dispose?.(),
        cache.dispose?.(),
        request.dispose?.(),
        comms.dispose?.(),
        theme.dispose?.(),
      ])
    },
  }
}
