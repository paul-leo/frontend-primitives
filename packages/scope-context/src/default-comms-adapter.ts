import { buildScopedKey } from 'scope-manager'
import type { ScopeCommsAdapter } from './types'

interface CommsMessage {
  event: string
  payload: unknown
}

/**
 * Zero-dependency comms adapter backed by BroadcastChannel, one channel per scope for its
 * whole lifetime. Scopes here are simultaneously-alive, not pooled/reused, so unlike the
 * fail-closed FilteredChannel pattern in the cross-instance-messaging recipe (which exists for
 * a *shared, reused* transport), two tabs legitimately open on the same scopeId SHOULD see
 * each other's messages — that's cross-tab sync of the same scope, not a leak.
 */
export function createBroadcastChannelCommsAdapter(): (scopeId: string) => ScopeCommsAdapter<BroadcastChannel> {
  return (scopeId) => {
    const channel = new BroadcastChannel(buildScopedKey('scope-context', scopeId))
    const listeners = new Map<string, Set<(payload: unknown) => void>>()

    channel.addEventListener('message', (messageEvent: MessageEvent<CommsMessage>) => {
      const { event, payload } = messageEvent.data
      listeners.get(event)?.forEach((handler) => handler(payload))
    })

    return {
      client: channel,
      emit(event, payload) {
        channel.postMessage({ event, payload } satisfies CommsMessage)
      },
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)?.add(handler)
        return () => listeners.get(event)?.delete(handler)
      },
      dispose() {
        channel.close()
      },
    }
  }
}
