import { describe, expect, it } from 'vitest'
import { createPrefetchQueue } from './prefetch-queue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('PrefetchQueue', () => {
  it('never runs more than maxConcurrent tasks at once', async () => {
    const queue = createPrefetchQueue(2)
    let active = 0
    let maxActive = 0

    const tasks = Array.from({ length: 5 }, () =>
      queue.enqueue(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 1))
        active -= 1
        return 'done'
      }, 'background'),
    )

    await Promise.all(tasks)
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('runs a critical task before background tasks queued earlier', async () => {
    const queue = createPrefetchQueue(1)
    const order: string[] = []
    const first = deferred<void>()

    // occupy the single slot so the next two calls queue up behind it
    const blocking = queue.enqueue(async () => {
      await first.promise
      order.push('blocking')
    }, 'background')

    const backgroundTask = queue.enqueue(async () => {
      order.push('background')
    }, 'background')
    const criticalTask = queue.enqueue(async () => {
      order.push('critical')
    }, 'critical')

    first.resolve()
    await Promise.all([blocking, backgroundTask, criticalTask])

    expect(order).toEqual(['blocking', 'critical', 'background'])
  })

  it('rejects a non-positive maxConcurrent', () => {
    expect(() => createPrefetchQueue(0)).toThrow()
  })
})
