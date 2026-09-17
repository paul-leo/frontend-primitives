import { ScopeManager } from 'scope-manager'
import { describe, expect, it, vi } from 'vitest'
import { createInMemoryCacheAdapter } from './default-cache-adapter'
import { createScopeContext } from './scope-context'
import type { ScopeCacheAdapter, ScopeContext, ScopeRequestAdapter } from './types'

describe('cross-scope cache isolation', () => {
  it('a request made through scope A never lands in scope B\'s cache', async () => {
    const ctxA = createScopeContext('org-a')
    const ctxB = createScopeContext('org-b')

    await ctxA.request.query('shared-key', async () => 'A-value')

    expect(ctxA.cache.get('shared-key')).toBe('A-value')
    expect(ctxB.cache.get('shared-key')).toBeUndefined()
  })

  it('is impossible to wire wrong even with a request factory that ignores scopeId entirely', async () => {
    // This factory never looks at its scopeId argument — it can ONLY ever write into
    // whichever `cache` object it was directly handed. That's the actual guarantee:
    // not that the code is well-behaved, but that it was never given a reference to
    // any cache but its own.
    const ignoresScopeId = (_scopeId: string, cache: ScopeCacheAdapter): ScopeRequestAdapter => ({
      fetch: (input, init) => fetch(input, init),
      async query<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
        const value = await fetcher()
        cache.set(key, value)
        return value
      },
    })

    const ctxA = createScopeContext('org-a', { createRequest: ignoresScopeId })
    const ctxB = createScopeContext('org-b', { createRequest: ignoresScopeId })

    await ctxA.request.query('shared-key', async () => 'A-value')

    expect(ctxB.cache.get('shared-key')).toBeUndefined()
  })

  it('two scopes get independent cache objects, not a shared one with prefixed keys', () => {
    const ctxA = createScopeContext('org-a')
    const ctxB = createScopeContext('org-b')
    expect(ctxA.cache).not.toBe(ctxB.cache)
  })
})

describe('zero-config defaults', () => {
  it('createScopeContext works with no options at all', async () => {
    const ctx = createScopeContext('org-a')
    expect(ctx.memory).toBeUndefined()
    expect(await ctx.storage.get('missing')).toBeNull()
    expect(ctx.cache.get('missing')).toBeUndefined()
    expect(ctx.theme.getTheme()).toEqual({ tokens: {} })
    await ctx.destroy()
  })
})

describe('destroy() lifecycle', () => {
  it('fans out to every adapter\'s dispose() exactly once', async () => {
    const dispose = vi.fn()
    const ctx: ScopeContext = createScopeContext('org-a', {
      createStorage: () => ({
        get: async () => null,
        set: async () => {},
        delete: async () => {},
        clear: async () => {},
        dispose,
      }),
      createCache: () => ({
        get: () => undefined,
        set: () => {},
        invalidate: () => {},
        clear: () => {},
        dispose,
      }),
      createRequest: () => ({
        fetch: (input, init) => fetch(input, init),
        query: async (_key, fetcher) => fetcher(new AbortController().signal),
        dispose,
      }),
      createComms: () => ({
        emit: () => {},
        on: () => () => {},
        dispose,
      }),
      createTheme: () => ({
        getTheme: () => ({ tokens: {} }),
        setTheme: () => {},
        subscribe: () => () => {},
        dispose,
      }),
    })

    await ctx.destroy()

    expect(dispose).toHaveBeenCalledTimes(5)
  })

  it('composes with ScopeManager as a real disposeScope callback', async () => {
    const closeSpy = vi.fn()
    const manager = new ScopeManager<ScopeContext>({
      createScope: (scopeId) =>
        createScopeContext(scopeId, {
          createComms: () => ({
            emit: () => {},
            on: () => () => {},
            dispose: closeSpy,
          }),
        }),
      disposeScope: (ctx) => {
        void ctx.destroy()
      },
    })

    manager.getOrCreate('org-a')
    manager.destroy('org-a')

    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})

describe('N scopes alive simultaneously', () => {
  it('creating a second scope does not dispose the first', () => {
    const disposeA = vi.fn()
    const manager = new ScopeManager<ScopeContext>({
      createScope: (scopeId) =>
        createScopeContext(scopeId, {
          createCache: createInMemoryCacheAdapter(),
          createComms: (id) => ({
            emit: () => {},
            on: () => () => {},
            dispose: id === 'org-a' ? disposeA : undefined,
          }),
        }),
      disposeScope: (ctx) => {
        void ctx.destroy()
      },
    })

    const orgA = manager.getOrCreate('org-a')
    const orgB = manager.getOrCreate('org-b')

    expect(manager.has('org-a')).toBe(true)
    expect(manager.has('org-b')).toBe(true)
    expect(orgA.cache.client).not.toBe(orgB.cache.client)
    expect(disposeA).not.toHaveBeenCalled()
  })
})
