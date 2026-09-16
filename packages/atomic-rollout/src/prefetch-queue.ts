export interface PrefetchQueue {
  enqueue<T>(fn: () => Promise<T>, priority: 'critical' | 'background'): Promise<T>
}

type QueuedTask = () => void

/**
 * A single global concurrency limit shared by every enqueued task, with 'critical' tasks always
 * dequeued ahead of 'background' ones. Prefetching is background work — it should never win a
 * race against foreground work for the same limited bandwidth.
 */
export function createPrefetchQueue(maxConcurrent: number): PrefetchQueue {
  if (maxConcurrent <= 0) throw new Error('maxConcurrent must be > 0')

  let active = 0
  const criticalQueue: QueuedTask[] = []
  const backgroundQueue: QueuedTask[] = []

  function runNext(): void {
    if (active >= maxConcurrent) return
    const next = criticalQueue.shift() ?? backgroundQueue.shift()
    if (!next) return
    active += 1
    next()
  }

  return {
    enqueue<T>(fn: () => Promise<T>, priority: 'critical' | 'background'): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const task: QueuedTask = () => {
          fn()
            .then(resolve, reject)
            .finally(() => {
              active -= 1
              runNext()
            })
        }
        const queue = priority === 'critical' ? criticalQueue : backgroundQueue
        queue.push(task)
        runNext()
      })
    },
  }
}
