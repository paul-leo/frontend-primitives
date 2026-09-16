import { describe, expect, it, vi } from 'vitest'
import { ScopeManager } from './registry'

describe('ScopeManager', () => {
  it('getOrCreate is idempotent for the same scopeId', () => {
    const createScope = vi.fn((id: string) => ({ id }))
    const manager = new ScopeManager({ createScope })

    const a = manager.getOrCreate('org-1')
    const b = manager.getOrCreate('org-1')

    expect(a).toBe(b)
    expect(createScope).toHaveBeenCalledTimes(1)
  })

  it('getOrCreate creates independent values for different scopeIds', () => {
    const manager = new ScopeManager({ createScope: (id: string) => ({ id }) })

    const a = manager.getOrCreate('org-1')
    const b = manager.getOrCreate('org-2')

    expect(a).not.toBe(b)
    expect(manager.size()).toBe(2)
  })

  it('destroy calls disposeScope exactly once and removes the scope', () => {
    const disposeScope = vi.fn()
    const manager = new ScopeManager({ createScope: (id: string) => ({ id }), disposeScope })

    manager.getOrCreate('org-1')
    const destroyed = manager.destroy('org-1')

    expect(destroyed).toBe(true)
    expect(disposeScope).toHaveBeenCalledTimes(1)
    expect(manager.has('org-1')).toBe(false)

    // destroying again is a no-op, not a second dispose call
    expect(manager.destroy('org-1')).toBe(false)
    expect(disposeScope).toHaveBeenCalledTimes(1)
  })

  it('destroyAll tears down every live scope', () => {
    const disposeScope = vi.fn()
    const manager = new ScopeManager({ createScope: (id: string) => ({ id }), disposeScope })
    manager.getOrCreate('org-1')
    manager.getOrCreate('org-2')

    manager.destroyAll()

    expect(manager.size()).toBe(0)
    expect(disposeScope).toHaveBeenCalledTimes(2)
  })

  it('epoch only increments on destroy and is preserved across rebuilds', () => {
    const manager = new ScopeManager({ createScope: (id: string) => ({ id }) })

    expect(manager.epoch('org-1')).toBe(0)
    manager.getOrCreate('org-1')
    expect(manager.epoch('org-1')).toBe(0)

    manager.destroy('org-1')
    expect(manager.epoch('org-1')).toBe(1)

    manager.getOrCreate('org-1')
    expect(manager.epoch('org-1')).toBe(1)

    manager.destroy('org-1')
    expect(manager.epoch('org-1')).toBe(2)
  })

  it('list reflects only currently live scopeIds', () => {
    const manager = new ScopeManager({ createScope: (id: string) => ({ id }) })
    manager.getOrCreate('org-1')
    manager.getOrCreate('org-2')
    manager.destroy('org-1')

    expect(manager.list()).toEqual(['org-2'])
  })
})
