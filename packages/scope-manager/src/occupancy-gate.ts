/**
 * A synchronous mutual-exclusion check for "is this resource key already claimed by
 * someone else, within this process." Decisions are made and recorded in the same
 * synchronous step (no await between check and set), so two callers racing to claim
 * the same key can never both succeed.
 */
export interface OccupancyGate {
  claim(resourceKey: string, holderId: string): boolean
  release(resourceKey: string, holderId: string): void
  /** excludingHolderId lets a holder check "is anyone ELSE holding this" without tripping over itself. */
  isClaimed(resourceKey: string, excludingHolderId?: string): boolean
}

export function createOccupancyGate(): OccupancyGate {
  const holders = new Map<string, string>()

  return {
    claim(resourceKey, holderId) {
      const current = holders.get(resourceKey)
      if (current !== undefined && current !== holderId) return false
      holders.set(resourceKey, holderId)
      return true
    },
    release(resourceKey, holderId) {
      if (holders.get(resourceKey) === holderId) holders.delete(resourceKey)
    },
    isClaimed(resourceKey, excludingHolderId) {
      const current = holders.get(resourceKey)
      if (current === undefined) return false
      if (excludingHolderId !== undefined && current === excludingHolderId) return false
      return true
    },
  }
}
