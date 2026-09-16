import { describe, expect, it } from 'vitest'
import { createOccupancyGate } from './occupancy-gate'

describe('OccupancyGate', () => {
  it('isClaimed excludes the holder that just claimed successfully', () => {
    const gate = createOccupancyGate()
    gate.claim('slot-1', 'holder-a')

    expect(gate.isClaimed('slot-1')).toBe(true)
    expect(gate.isClaimed('slot-1', 'holder-a')).toBe(false)
    expect(gate.isClaimed('slot-1', 'holder-b')).toBe(true)
  })

  it('exactly one of two same-tick claim() calls for the same key succeeds', () => {
    const gate = createOccupancyGate()

    const first = gate.claim('slot-1', 'holder-a')
    const second = gate.claim('slot-1', 'holder-b')

    expect([first, second].filter(Boolean)).toHaveLength(1)
  })

  it('release only clears the slot when called by the current holder', () => {
    const gate = createOccupancyGate()
    gate.claim('slot-1', 'holder-a')

    gate.release('slot-1', 'holder-b') // not the holder — no-op
    expect(gate.isClaimed('slot-1')).toBe(true)

    gate.release('slot-1', 'holder-a')
    expect(gate.isClaimed('slot-1')).toBe(false)
  })

  it('the same holder can re-claim its own slot', () => {
    const gate = createOccupancyGate()
    expect(gate.claim('slot-1', 'holder-a')).toBe(true)
    expect(gate.claim('slot-1', 'holder-a')).toBe(true)
  })
})
