import { QueryClient } from '@tanstack/query-core'
import { describe, expect, it } from 'vitest'
import { createTanStackQueryCacheAdapter } from './cache-adapter'

describe('createTanStackQueryCacheAdapter', () => {
  it('get/set round-trip through the underlying QueryClient', () => {
    const cache = createTanStackQueryCacheAdapter()('org-1')
    cache.set(['memo-list', 'ws-1'], ['memo-a'])
    expect(cache.get(['memo-list', 'ws-1'])).toEqual(['memo-a'])
    expect(cache.client.getQueryData(['memo-list', 'ws-1'])).toEqual(['memo-a'])
  })

  it('two scopes get two distinct QueryClient instances', () => {
    const a = createTanStackQueryCacheAdapter()('org-a')
    const b = createTanStackQueryCacheAdapter()('org-b')
    expect(a.client).toBeInstanceOf(QueryClient)
    expect(a.client).not.toBe(b.client)
  })

  it('invalidate without exact clears every key sharing the prefix', async () => {
    const cache = createTanStackQueryCacheAdapter()('org-1')
    cache.set(['memo-list', 'ws-1'], 'a')
    cache.set(['memo-list', 'ws-2'], 'b')

    cache.invalidate(['memo-list'])
    // invalidateQueries marks queries stale asynchronously; give it a tick
    await Promise.resolve()

    expect(cache.client.getQueryState(['memo-list', 'ws-1'])?.isInvalidated).toBe(true)
    expect(cache.client.getQueryState(['memo-list', 'ws-2'])?.isInvalidated).toBe(true)
  })

  it('clear() empties the client', () => {
    const cache = createTanStackQueryCacheAdapter()('org-1')
    cache.set('a', 1)
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
  })

  it('dispose() unmounts the client without throwing', () => {
    const cache = createTanStackQueryCacheAdapter()('org-1')
    expect(() => cache.dispose?.()).not.toThrow()
  })
})
