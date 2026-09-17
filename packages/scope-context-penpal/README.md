# scope-context-penpal

A [`scope-context`](../scope-context) comms adapter with fail-closed sender attribution — the
`FilteredChannel` pattern from
[`docs/recipes/cross-instance-messaging-with-penpal.md`](../../docs/recipes/cross-instance-messaging-with-penpal.md) —
plus a small bridge for Penpal-shaped two-way RPC transports (host ↔ sandboxed iframe/worker).

This package does not literally depend on the `penpal` npm package — Penpal (like Comlink, or
any RPC library built on bidirectional method calls) has no native publish/subscribe, only
method calls in each direction, so `createPenpalTransport` adapts *any* such bridge into the
plain `publish`/`subscribe` shape the fail-closed adapter expects.

```ts
import { createScopeContext } from 'scope-context'
import { createFilteredCommsAdapter, createPenpalTransport } from 'scope-context-penpal'

// Wire a real Penpal connection: expose receiveScopeMessage(raw) as a method on BOTH sides,
// then bridge it into the shape createPenpalTransport expects.
const bridge = {
  sendToRemote: (raw: string) => remoteConnection.receiveScopeMessage(raw),
  onReceiveFromRemote: (handler: (raw: string) => void) => {
    localMethods.receiveScopeMessage = handler
  },
}

const ctx = createScopeContext('org-a', {
  createComms: createFilteredCommsAdapter({
    instanceId: 'session-42',
    createTransport: () => createPenpalTransport(bridge),
  }),
})
```

## Pairing with `instance-pool`

If the underlying transport is shared across a *pooled, reused* resource (see
[`instance-pool`](../instance-pool)), pass a shared `OccupancyGate` (from
[`scope-manager`](../scope-manager)) and a `resourceKey` — a message from a previously-released
holder of that resource is then dropped instead of misattributed to whoever claimed it next:

```ts
import { createOccupancyGate } from 'scope-manager'

const gate = createOccupancyGate()
gate.claim('iframe-slot-1', 'session-42')

createFilteredCommsAdapter({
  instanceId: 'session-42',
  createTransport: () => createPenpalTransport(bridge),
  occupancyGate: gate,
  resourceKey: 'iframe-slot-1',
})
```

MIT licensed.
