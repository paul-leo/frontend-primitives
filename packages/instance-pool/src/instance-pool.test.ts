import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstancePool } from './instance-pool'
import type { PooledInstance, PooledInstanceState } from './pooled-instance'

interface FakeProps {
  active: boolean
}

function createFakeInstance(sessionKey: string): PooledInstance<FakeProps> {
  let state: PooledInstanceState = 'idle'
  return {
    get state() {
      return state
    },
    sessionKey,
    claim() {
      state = 'claimed'
    },
    release() {
      state = 'idle'
    },
    destroy() {
      state = 'destroyed'
    },
  }
}

describe('InstancePool', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives different sessionKeys different instances and the same sessionKey the same instance', () => {
    const pool = new InstancePool<FakeProps>({ idleProps: { active: false }, createInstance: createFakeInstance })

    const a1 = pool.getOrCreate('session-a')
    const a2 = pool.getOrCreate('session-a')
    const b = pool.getOrCreate('session-b')

    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
  })

  it('re-getOrCreate during cooldown returns the same, still-live instance', () => {
    const pool = new InstancePool<FakeProps>({
      idleProps: { active: false },
      createInstance: createFakeInstance,
      cooldownMs: 1000,
    })

    const instance = pool.getOrCreate('session-a')
    instance.claim({ active: true })
    pool.release('session-a')

    vi.advanceTimersByTime(500) // still within cooldown
    const reclaimed = pool.getOrCreate('session-a')

    expect(reclaimed).toBe(instance)
    expect(reclaimed.state).not.toBe('destroyed')
  })

  it('destroys the instance once cooldown expires without being reclaimed', () => {
    const pool = new InstancePool<FakeProps>({
      idleProps: { active: false },
      createInstance: createFakeInstance,
      cooldownMs: 1000,
    })

    const instance = pool.getOrCreate('session-a')
    pool.release('session-a')

    vi.advanceTimersByTime(1000)

    expect(instance.state).toBe('destroyed')
  })

  it('evicts the least-recently-touched instance once maxPoolSize is exceeded', () => {
    const pool = new InstancePool<FakeProps>({
      idleProps: { active: false },
      createInstance: createFakeInstance,
      maxPoolSize: 2,
    })

    const a = pool.getOrCreate('session-a')
    pool.getOrCreate('session-b')
    pool.getOrCreate('session-c') // should evict 'a'

    expect(a.state).toBe('destroyed')
  })

  it('calls onInstanceCreated exactly once per instance, independent of claim state', () => {
    const onInstanceCreated = vi.fn()
    const pool = new InstancePool<FakeProps>({
      idleProps: { active: false },
      createInstance: createFakeInstance,
      onInstanceCreated,
    })

    const instance = pool.getOrCreate('session-a')
    pool.getOrCreate('session-a') // second lookup, same instance — must not re-fire the hook

    expect(onInstanceCreated).toHaveBeenCalledTimes(1)
    expect(onInstanceCreated).toHaveBeenCalledWith(instance, 'session-a')
  })

  it('destroyAll tears down every live instance and cancels pending cooldowns', () => {
    const pool = new InstancePool<FakeProps>({ idleProps: { active: false }, createInstance: createFakeInstance, cooldownMs: 1000 })
    const a = pool.getOrCreate('session-a')
    const b = pool.getOrCreate('session-b')
    pool.release('session-a')

    pool.destroyAll()

    expect(a.state).toBe('destroyed')
    expect(b.state).toBe('destroyed')

    // the cooldown timer for session-a must not fire a second, harmless destroy afterwards
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow()
  })
})
