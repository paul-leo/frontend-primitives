export interface LockRunInfo {
  /** Did this run have to wait for another context's lock, vs. acquire immediately? */
  contended: boolean
}

export interface SharedLock {
  run<R>(name: string, fn: (info: LockRunInfo) => Promise<R>): Promise<R>
}

/** The subset of the Web Locks API (`navigator.locks`) this module depends on. */
export interface WebLocksLike {
  request<T>(name: string, options: { ifAvailable: true }, callback: (lock: { name: string } | null) => T | PromiseLike<T>): Promise<T>
  request<T>(name: string, callback: (lock: { name: string }) => T | PromiseLike<T>): Promise<T>
}

/**
 * A best-effort, advisory cross-context lock backed by the Web Locks API. Uses a two-phase
 * probe — a non-blocking `{ ifAvailable: true }` request first — to distinguish "acquired
 * immediately" from "had to wait for another tab/window's lock" (the `contended` signal),
 * without a race window: the probe callback itself holds the real lock for the duration of
 * the caller's work when it succeeds, rather than releasing and re-acquiring.
 */
export function createWebLocksLock(locks: WebLocksLike | undefined = getGlobalLocks()): SharedLock {
  if (!locks) {
    throw new Error('Web Locks API is not available in this environment — use createNoopLock() instead')
  }
  const webLocks = locks

  return {
    run<R>(name: string, fn: (info: LockRunInfo) => Promise<R>): Promise<R> {
      return new Promise<R>((resolve, reject) => {
        webLocks
          .request(name, { ifAvailable: true }, async (lock) => {
            if (lock !== null) {
              try {
                resolve(await fn({ contended: false }))
              } catch (err) {
                reject(err)
              }
              return
            }
            try {
              await webLocks.request(name, async () => {
                try {
                  resolve(await fn({ contended: true }))
                } catch (err) {
                  reject(err)
                }
              })
            } catch (err) {
              reject(err)
            }
          })
          .catch(reject)
      })
    },
  }
}

/** Graceful degradation for environments without the Web Locks API: never blocks, never contends. */
export function createNoopLock(): SharedLock {
  return {
    run: (_name, fn) => fn({ contended: false }),
  }
}

function getGlobalLocks(): WebLocksLike | undefined {
  return (globalThis as { navigator?: { locks?: WebLocksLike } }).navigator?.locks
}
