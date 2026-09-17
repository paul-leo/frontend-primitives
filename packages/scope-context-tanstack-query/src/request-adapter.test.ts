import { describe, expect, it, vi } from 'vitest'
import { createScopeContext } from 'scope-context'
import { createTanStackQueryCacheAdapter } from './cache-adapter'
import { createTanStackQueryRequestAdapter } from './request-adapter'

function buildScope(scopeId: string) {
  return createScopeContext(scopeId, {
    createCache: createTanStackQueryCacheAdapter(),
    createRequest: createTanStackQueryRequestAdapter(),
  })
}

describe('createTanStackQueryRequestAdapter', () => {
  it('query() writes its result into the same QueryClient the cache adapter holds', async () => {
    const ctx = buildScope('org-1')
    const value = await ctx.request.query(['memo-list'], async () => ['memo-a'])
    expect(value).toEqual(['memo-a'])
    expect(ctx.cache.client.getQueryData(['memo-list'])).toEqual(['memo-a'])
  })

  it('two scopes built with the TanStack adapters never cross-contaminate', async () => {
    const orgA = buildScope('org-a')
    const orgB = buildScope('org-b')

    await orgA.request.query('shared-key', async () => 'A-value')

    expect(orgA.cache.get('shared-key')).toBe('A-value')
    expect(orgB.cache.get('shared-key')).toBeUndefined()
    expect(orgA.cache.client).not.toBe(orgB.cache.client)
  })

  it('dedupes concurrent fetchQuery calls for the same key (TanStack Query built-in behavior)', async () => {
    const ctx = buildScope('org-1')
    const fetcher = vi.fn(async () => 'value')

    const [a, b] = await Promise.all([ctx.request.query('key', fetcher), ctx.request.query('key', fetcher)])

    expect(a).toBe('value')
    expect(b).toBe('value')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
