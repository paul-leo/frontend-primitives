import { describe, expect, it, vi } from 'vitest'
import { LruScopeManager } from './lru-registry'

describe('LruScopeManager', () => {
  it('evicts the least-recently-touched scope once maxSize is exceeded', () => {
    const disposeScope = vi.fn()
    const manager = new LruScopeManager({
      maxSize: 2,
      createScope: (id: string) => ({ id }),
      disposeScope,
    })

    manager.getOrCreate('a')
    manager.getOrCreate('b')
    manager.getOrCreate('c') // should evict 'a' (least recently touched)

    expect(manager.has('a')).toBe(false)
    expect(manager.has('b')).toBe(true)
    expect(manager.has('c')).toBe(true)
    expect(disposeScope).toHaveBeenCalledTimes(1)
  })

  it('a getOrCreate hit on an existing scope refreshes its touch order', () => {
    const manager = new LruScopeManager({ maxSize: 2, createScope: (id: string) => ({ id }) })

    manager.getOrCreate('a')
    manager.getOrCreate('b')
    manager.getOrCreate('a') // touch 'a' again — 'b' is now the oldest
    manager.getOrCreate('c') // should evict 'b', not 'a'

    expect(manager.has('a')).toBe(true)
    expect(manager.has('b')).toBe(false)
    expect(manager.has('c')).toBe(true)
  })

  it('rejects a non-positive maxSize', () => {
    expect(() => new LruScopeManager({ maxSize: 0, createScope: (id: string) => ({ id }) })).toThrow()
  })
})
