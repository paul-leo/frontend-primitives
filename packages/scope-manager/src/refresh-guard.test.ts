import { describe, expect, it } from 'vitest'
import { createRefreshGuard } from './refresh-guard'

describe('RefreshGuard', () => {
  it('isStale returns true for any seq earlier than the latest nextSeq()', () => {
    const guard = createRefreshGuard()

    const seq1 = guard.nextSeq()
    const seq2 = guard.nextSeq()

    expect(guard.isStale(seq1)).toBe(true)
    expect(guard.isStale(seq2)).toBe(false)
  })

  it('a fresh guard treats seq 0 as stale once nextSeq has been called', () => {
    const guard = createRefreshGuard()
    guard.nextSeq()
    expect(guard.isStale(0)).toBe(true)
  })
})
