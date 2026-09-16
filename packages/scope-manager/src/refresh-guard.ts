/**
 * A monotonic sequence counter for discarding stale async responses. Callers take a
 * sequence number before starting an async operation and check isStale() when it
 * resolves — if a newer operation has started in the meantime, the old response is
 * discarded instead of overwriting fresher state. This is safer than aborting the
 * in-flight request itself when multiple callers may legitimately be racing.
 */
export interface RefreshGuard {
  nextSeq(): number
  isStale(seq: number): boolean
}

export function createRefreshGuard(): RefreshGuard {
  let current = 0

  return {
    nextSeq() {
      current += 1
      return current
    },
    isStale(seq) {
      return seq < current
    },
  }
}
