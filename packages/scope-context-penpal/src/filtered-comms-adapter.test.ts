import { createOccupancyGate } from 'scope-manager'
import { describe, expect, it, vi } from 'vitest'
import { createFilteredCommsAdapter } from './filtered-comms-adapter'
import type { ScopeCommsTransport } from './transport'

/** A shared in-memory bus, simulating two ends of one underlying transport. */
function createSharedBus(): { forA: ScopeCommsTransport; forB: ScopeCommsTransport } {
  const listenersA = new Set<(raw: string) => void>()
  const listenersB = new Set<(raw: string) => void>()
  return {
    forA: {
      publish: (raw) => listenersB.forEach((l) => l(raw)),
      subscribe: (handler) => {
        listenersA.add(handler)
        return () => listenersA.delete(handler)
      },
    },
    forB: {
      publish: (raw) => listenersA.forEach((l) => l(raw)),
      subscribe: (handler) => {
        listenersB.add(handler)
        return () => listenersB.delete(handler)
      },
    },
  }
}

describe('createFilteredCommsAdapter', () => {
  it('delivers a properly-attributed message to the other end', () => {
    const bus = createSharedBus()
    const a = createFilteredCommsAdapter({ instanceId: 'a', createTransport: () => bus.forA })('org-1')
    const b = createFilteredCommsAdapter({ instanceId: 'b', createTransport: () => bus.forB })('org-1')
    const handler = vi.fn()
    b.on('greet', handler)

    a.emit('greet', { hello: 'world' })

    expect(handler).toHaveBeenCalledWith({ hello: 'world' })
  })

  it('drops a message with no sender attribution (fail closed)', () => {
    const bus = createSharedBus()
    const b = createFilteredCommsAdapter({ instanceId: 'b', createTransport: () => bus.forB })('org-1')
    const handler = vi.fn()
    b.on('greet', handler)

    bus.forA.publish(JSON.stringify({ event: 'greet', payload: {} })) // no senderId

    expect(handler).not.toHaveBeenCalled()
  })

  it('drops an unparseable message instead of throwing', () => {
    const bus = createSharedBus()
    const b = createFilteredCommsAdapter({ instanceId: 'b', createTransport: () => bus.forB })('org-1')
    const handler = vi.fn()
    b.on('greet', handler)

    expect(() => bus.forA.publish('not json')).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('drops a message from a holder the occupancy gate says has since been superseded', () => {
    const bus = createSharedBus()
    const gate = createOccupancyGate()
    gate.claim('resource-1', 'new-holder') // resource-1 is now held by 'new-holder', not 'stale-holder'

    const a = createFilteredCommsAdapter({
      instanceId: 'stale-holder',
      createTransport: () => bus.forA,
    })('org-1')
    const b = createFilteredCommsAdapter({
      instanceId: 'new-holder',
      createTransport: () => bus.forB,
      occupancyGate: gate,
      resourceKey: 'resource-1',
    })('org-1')
    const handler = vi.fn()
    b.on('greet', handler)

    a.emit('greet', { late: true }) // message from the stale holder, now superseded

    expect(handler).not.toHaveBeenCalled()
  })

  it('delivers a message from the current holder recognized by the occupancy gate', () => {
    const bus = createSharedBus()
    const gate = createOccupancyGate()
    gate.claim('resource-1', 'current-holder')

    const a = createFilteredCommsAdapter({ instanceId: 'current-holder', createTransport: () => bus.forA })('org-1')
    const b = createFilteredCommsAdapter({
      instanceId: 'current-holder',
      createTransport: () => bus.forB,
      occupancyGate: gate,
      resourceKey: 'resource-1',
    })('org-1')
    const handler = vi.fn()
    b.on('greet', handler)

    a.emit('greet', { ok: true })

    expect(handler).toHaveBeenCalledWith({ ok: true })
  })
})
