import { describe, expect, it, vi } from 'vitest'
import { createBroadcastChannelCommsAdapter } from './default-comms-adapter'

/** BroadcastChannel delivery is asynchronous and, under load, can take longer than a single
 *  macrotask tick — wait on an actual signal from the handler instead of a fixed timeout. */
function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'))
      setTimeout(check, 5)
    }
    check()
  })
}

describe('createBroadcastChannelCommsAdapter', () => {
  it('delivers an emitted event to a listener on the same scope', async () => {
    const a = createBroadcastChannelCommsAdapter()('org-1')
    const b = createBroadcastChannelCommsAdapter()('org-1')
    const handler = vi.fn()
    b.on('greet', handler)

    a.emit('greet', { hello: 'world' })
    await waitFor(() => handler.mock.calls.length > 0)

    expect(handler).toHaveBeenCalledWith({ hello: 'world' })
    a.dispose?.()
    b.dispose?.()
  })

  it('does not deliver events across different scopeIds', async () => {
    const a = createBroadcastChannelCommsAdapter()('org-1')
    const b = createBroadcastChannelCommsAdapter()('org-2')
    const handler = vi.fn()
    b.on('greet', handler)
    // control signal on the SAME scope as `a`, so we know delivery had time to happen
    const control = createBroadcastChannelCommsAdapter()('org-1')
    const controlHandler = vi.fn()
    control.on('greet', controlHandler)

    a.emit('greet', {})
    await waitFor(() => controlHandler.mock.calls.length > 0)

    expect(handler).not.toHaveBeenCalled()
    a.dispose?.()
    b.dispose?.()
    control.dispose?.()
  })

  it('the unsubscribe function stops delivering further events', async () => {
    const a = createBroadcastChannelCommsAdapter()('org-1')
    const b = createBroadcastChannelCommsAdapter()('org-1')
    const handler = vi.fn()
    const unsubscribe = b.on('greet', handler)
    unsubscribe()
    const controlHandler = vi.fn()
    b.on('control', controlHandler)

    a.emit('greet', {})
    a.emit('control', {})
    await waitFor(() => controlHandler.mock.calls.length > 0)

    expect(handler).not.toHaveBeenCalled()
    a.dispose?.()
    b.dispose?.()
  })
})
