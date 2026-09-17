import { describe, expect, it } from 'vitest'
import { createNoopLock, createWebLocksLock, type WebLocksLike } from './web-locks-lock'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** A minimal single-name mutex that mirrors the real Web Locks API's request() overloads. */
function createFakeWebLocks(): WebLocksLike {
  let held = false
  const waiters: Array<() => void> = []

  function acquire(): Promise<void> {
    if (!held) {
      held = true
      return Promise.resolve()
    }
    return new Promise((resolve) => waiters.push(resolve))
  }

  function release(): void {
    const next = waiters.shift()
    if (next) {
      next() // hand off to the next waiter — the lock stays held
    } else {
      held = false
    }
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async request(name: string, a: any, b?: any) {
      const hasOptions = typeof a !== 'function'
      const options = hasOptions ? a : undefined
      const callback = hasOptions ? b : a

      if (options?.ifAvailable) {
        if (held) return callback(null)
        held = true
        try {
          return await callback({ name })
        } finally {
          release()
        }
      }

      await acquire()
      try {
        return await callback({ name })
      } finally {
        release()
      }
    },
  } as WebLocksLike
}

describe('createNoopLock', () => {
  it('never blocks and never reports contention', async () => {
    const lock = createNoopLock()
    const result = await lock.run('any', async (info) => {
      expect(info.contended).toBe(false)
      return 'done'
    })
    expect(result).toBe('done')
  })
})

describe('createWebLocksLock', () => {
  it('reports contended: false when acquired immediately', async () => {
    const lock = createWebLocksLock(createFakeWebLocks())
    const result = await lock.run('resource-a', async (info) => {
      expect(info.contended).toBe(false)
      return 'ok'
    })
    expect(result).toBe('ok')
  })

  it('the second of two concurrent runs for the same name waits and reports contended: true', async () => {
    const webLocks = createFakeWebLocks()
    const lock = createWebLocksLock(webLocks)
    const order: string[] = []
    const holdFirst = deferred<void>()

    const first = lock.run('resource-a', async (info) => {
      expect(info.contended).toBe(false)
      await holdFirst.promise
      order.push('first')
      return 'first-result'
    })

    // give the first run's probe a tick to actually claim the lock before the second starts
    await Promise.resolve()

    const second = lock.run('resource-a', async (info) => {
      expect(info.contended).toBe(true)
      order.push('second')
      return 'second-result'
    })

    holdFirst.resolve()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(order).toEqual(['first', 'second'])
    expect(firstResult).toBe('first-result')
    expect(secondResult).toBe('second-result')
  })

  it('throws when no Web Locks implementation is available', () => {
    expect(() => createWebLocksLock(undefined)).toThrow()
  })
})
