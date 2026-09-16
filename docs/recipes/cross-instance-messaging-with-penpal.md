# Cross-instance messaging with Penpal / PostRobot / BroadcastChannel

There are two different messaging problems that get conflated under "cross-instance
communication," and they call for different tools.

## Same-origin, same-page-type: `BroadcastChannel`

Multiple tabs or windows of the *same* app, same origin, talking to each other (e.g. syncing UI
state, or the LWW broadcast pattern in
[`cross-tab-coordination-with-web-locks.md`](./cross-tab-coordination-with-web-locks.md)). The
native `BroadcastChannel` API (or the
[`broadcast-channel`](https://www.npmjs.com/package/broadcast-channel) npm package for older
browser support) is the right, boring choice here. No sandboxing concerns, no origin negotiation.

## Host ↔ sandboxed sub-app: Penpal or PostRobot

A host application talking to an untrusted or independently-deployed sub-app running inside an
`iframe` — the classic micro-frontend sandbox shape — is a different problem: promise-based
request/response semantics across an origin boundary, with a handshake. Don't hand-roll this with
raw `postMessage` and a `Map` of pending callbacks. Use:

- **[Penpal](https://www.npmjs.com/package/penpal)** — purpose-built for iframe/worker/window
  RPC, promise-based, actively maintained, this is the de facto standard for the micro-frontend
  case.
- **[PostRobot](https://www.npmjs.com/package/post-robot)** (PayPal) — similar shape, and its
  messages are namespaced by event name out of the box, which gives you part of the filtering
  layer below for free.

## What neither of them gives you: scoped, fail-closed filtering

Neither library knows about *your* notion of "which sub-app instance is this message actually
for" once you have more than one live instance sharing a message bus (a pooled `iframe`, a
multi-tab session). Wrap whichever transport you pick in a filter that defaults to rejecting a
message rather than accepting one it can't positively attribute:

```ts
import { createOccupancyGate } from 'scope-manager'

function createFilteredChannel<T>(instanceId: string, transport: PenpalConnection) {
  return {
    send(message: T) {
      transport.send({ ...message, __senderId: instanceId })
    },
    onMessage(handler: (message: T) => void) {
      transport.onMessage((raw) => {
        // Fail closed: an unrecognized/missing sender is dropped, not forwarded "just in case".
        if (raw.__senderId !== instanceId) return
        handler(raw)
      })
    },
  }
}
```

If you're pooling multiple instances against one underlying transport (see the `instance-pool`
package), pair this with an `OccupancyGate` so a message can never be routed to an instance that
has already been released back to the pool and reclaimed by a different session.

## One asymmetry worth documenting explicitly

A host often has a direct, isolated channel *to* a specific sub-app instance (e.g. an isolated
`postMessage` target), but a sub-app broadcasting back to the host may not have an equivalently
isolated return path — it may be shouting onto a bus every other instance can also hear. Don't
assume the two directions are symmetric; document which direction is structurally isolated and
which one relies on the filter above.
