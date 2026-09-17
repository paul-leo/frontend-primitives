import type { ScopeCommsTransport } from './transport'

/**
 * A two-way RPC bridge shape matching how Penpal (or Comlink, or any RPC library built on
 * bidirectional method calls) actually works: there's no native publish/subscribe, only method
 * calls in each direction. Wiring a real Penpal connection: expose a `receiveScopeMessage(raw)`
 * method in BOTH sides' `methods` object; `sendToRemote` calls the *remote's*
 * `receiveScopeMessage`; your own `receiveScopeMessage` implementation should call whichever
 * handler was registered via `onReceiveFromRemote`.
 */
export interface PenpalBridge {
  sendToRemote(raw: string): void | Promise<void>
  onReceiveFromRemote(handler: (raw: string) => void): void
}

/** Adapts a PenpalBridge into the plain publish/subscribe shape createFilteredCommsAdapter expects. */
export function createPenpalTransport(bridge: PenpalBridge): ScopeCommsTransport {
  const listeners = new Set<(raw: string) => void>()
  bridge.onReceiveFromRemote((raw) => {
    listeners.forEach((listener) => listener(raw))
  })

  return {
    publish(raw) {
      void bridge.sendToRemote(raw)
    },
    subscribe(handler) {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
  }
}
