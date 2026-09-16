export interface CooldownScheduler {
  schedule(key: string, ms: number, onExpire: () => void): void
  cancel(key: string): void
}

/** A per-key setTimeout wrapper: scheduling a key that already has a pending timer replaces it. */
export function createCooldownScheduler(): CooldownScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  return {
    schedule(key, ms, onExpire) {
      this.cancel(key)
      const timer = setTimeout(() => {
        timers.delete(key)
        onExpire()
      }, ms)
      timers.set(key, timer)
    },
    cancel(key) {
      const timer = timers.get(key)
      if (timer !== undefined) {
        clearTimeout(timer)
        timers.delete(key)
      }
    },
  }
}
