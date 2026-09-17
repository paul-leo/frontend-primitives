import { describe, expect, it } from 'vitest'
import { createInMemoryCacheAdapter } from './default-cache-adapter'

describe('createInMemoryCacheAdapter', () => {
  it('get/set round-trips a value', () => {
    const cache = createInMemoryCacheAdapter()('org-1')
    cache.set(['memo-list', 'ws-1'], ['memo-a'])
    expect(cache.get(['memo-list', 'ws-1'])).toEqual(['memo-a'])
  })

  it('get returns undefined for a missing key', () => {
    const cache = createInMemoryCacheAdapter()('org-1')
    expect(cache.get('missing')).toBeUndefined()
  })

  it('invalidate with exact only removes the exact key', () => {
    const cache = createInMemoryCacheAdapter()('org-1')
    cache.set(['memo-list', 'ws-1'], 'a')
    cache.set(['memo-list', 'ws-2'], 'b')

    cache.invalidate(['memo-list', 'ws-1'], { exact: true })

    expect(cache.get(['memo-list', 'ws-1'])).toBeUndefined()
    expect(cache.get(['memo-list', 'ws-2'])).toBe('b')
  })

  it('invalidate without exact removes every key sharing the prefix', () => {
    const cache = createInMemoryCacheAdapter()('org-1')
    cache.set(['memo-list', 'ws-1'], 'a')
    cache.set(['memo-list', 'ws-2'], 'b')
    cache.set(['other'], 'c')

    cache.invalidate(['memo-list'])

    expect(cache.get(['memo-list', 'ws-1'])).toBeUndefined()
    expect(cache.get(['memo-list', 'ws-2'])).toBeUndefined()
    expect(cache.get(['other'])).toBe('c')
  })

  it('clear removes everything', () => {
    const cache = createInMemoryCacheAdapter()('org-1')
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeUndefined()
  })
})
