import { describe, expect, it, vi } from 'vitest'
import { createPenpalTransport, type PenpalBridge } from './penpal-bridge'

function createFakeBridgePair(): { forA: PenpalBridge; forB: PenpalBridge } {
  let bHandler: ((raw: string) => void) | undefined
  let aHandler: ((raw: string) => void) | undefined
  return {
    forA: {
      sendToRemote: (raw) => bHandler?.(raw),
      onReceiveFromRemote: (handler) => {
        aHandler = handler
      },
    },
    forB: {
      sendToRemote: (raw) => aHandler?.(raw),
      onReceiveFromRemote: (handler) => {
        bHandler = handler
      },
    },
  }
}

describe('createPenpalTransport', () => {
  it('publish() on one side calls sendToRemote, delivered to the other side\'s subscriber', () => {
    const bridges = createFakeBridgePair()
    const transportA = createPenpalTransport(bridges.forA)
    const transportB = createPenpalTransport(bridges.forB)
    const handler = vi.fn()
    transportB.subscribe(handler)

    transportA.publish('hello')

    expect(handler).toHaveBeenCalledWith('hello')
  })

  it('subscribe() returns an unsubscribe function that stops delivery', () => {
    const bridges = createFakeBridgePair()
    const transportA = createPenpalTransport(bridges.forA)
    const transportB = createPenpalTransport(bridges.forB)
    const handler = vi.fn()
    const unsubscribe = transportB.subscribe(handler)
    unsubscribe()

    transportA.publish('hello')

    expect(handler).not.toHaveBeenCalled()
  })
})
