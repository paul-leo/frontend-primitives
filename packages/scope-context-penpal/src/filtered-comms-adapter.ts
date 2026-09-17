import type { ScopeCommsAdapter } from 'scope-context'
import type { OccupancyGate } from 'scope-manager'
import type { ScopeCommsTransport } from './transport'

interface FilteredMessage {
  event: string
  payload: unknown
  senderId: string
}

export interface FilteredCommsAdapterOptions {
  /** Identity of the instance currently using this adapter. */
  instanceId: string
  createTransport: (scopeId: string) => ScopeCommsTransport
  /**
   * Pass when this adapter backs a pooled/reused resource (see `instance-pool`) sharing one
   * transport over time, so a message from a previously-released holder of `resourceKey` is
   * dropped instead of misattributed to whoever claimed it next.
   */
  occupancyGate?: OccupancyGate
  resourceKey?: string
}

/**
 * Fail-closed comms adapter: a message with no sender attribution, or one attributable to a
 * holder that has since been superseded, is dropped rather than delivered "just in case".
 */
export function createFilteredCommsAdapter(
  options: FilteredCommsAdapterOptions,
): (scopeId: string) => ScopeCommsAdapter<ScopeCommsTransport> {
  return (scopeId) => {
    const transport = options.createTransport(scopeId)
    const listeners = new Map<string, Set<(payload: unknown) => void>>()

    transport.subscribe((raw) => {
      let message: FilteredMessage
      try {
        message = JSON.parse(raw) as FilteredMessage
      } catch {
        return // fail closed: unparseable payload
      }
      if (typeof message.senderId !== 'string') return // fail closed: no sender attribution

      if (options.occupancyGate && options.resourceKey) {
        // isClaimed(key, excludingHolderId) is true when someone OTHER than the message's
        // claimed sender currently holds this resource — i.e. this message is stale.
        if (options.occupancyGate.isClaimed(options.resourceKey, message.senderId)) return
      }

      listeners.get(message.event)?.forEach((handler) => handler(message.payload))
    })

    return {
      client: transport,
      emit(event, payload) {
        const message: FilteredMessage = { event, payload, senderId: options.instanceId }
        transport.publish(JSON.stringify(message))
      },
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)?.add(handler)
        return () => listeners.get(event)?.delete(handler)
      },
      dispose() {
        transport.dispose?.()
      },
    }
  }
}
