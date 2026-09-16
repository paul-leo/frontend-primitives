# Shared runtime coordination

This pattern applies specifically to **shared-realm** micro-frontend integration — most commonly
[Module Federation](https://module-federation.io/) — where a host and one or more remotes run in
the *same* JS runtime and can share module instances, as opposed to sandboxed approaches (an
`iframe`-based host like [wujie](https://github.com/Tencent/wujie), or Web Components) where each
sub-app gets its own realm.

Sharing a realm is a deliberate trade: no serialization overhead, no `postMessage` round trips,
shared framework instances — at the cost of three race conditions that sandboxed approaches don't
structurally have, because a sandboxed sub-app simply cannot observe another sub-app's in-memory
module state.

## 1. The "consumed before ready" race on shared modules

A shared singleton module can be imported and used by one remote before the host (or another
remote acting as the actual provider) has finished initializing it — because "shared" module
resolution decides *which copy* wins at load time, not *whether it's ready* at that point.

**Fix**: a bootstrap pattern — the actual application code is loaded in a dynamically-imported
`bootstrap.ts`, not directly in the entry module, so the shared-module resolution step completes
*before* any application code that might consume those shared modules starts running:

```ts
// entry.ts — intentionally does nothing except defer
import('./bootstrap')

// bootstrap.ts — shared-module resolution has already settled by the time this runs
import { sharedAuthStore } from 'host/authStore'
sharedAuthStore.getCurrentUser() // safe: the shared instance is now the real, initialized one
```

## 2. A shared singleton needs exactly one initializer

If more than one remote can legitimately call `initialize()` on a shared singleton, races on
*which* caller's initialization wins become possible — and in the case this pattern was extracted
from, the losing path fell through to unauthenticated behavior, which surfaced as a
cross-device-kick logout affecting sessions that had nothing to do with the actual expired
credential. Structure ownership so exactly one participant (almost always the host) calls the
real initializer, and every other participant only ever subscribes to its result:

```ts
// host: the one true initializer
export const authStore = createReloadableSharedValue(/* ... */)
authStore.reload()

// remote: subscriber only, never re-initializes
import { authStore } from 'host/authStore'
authStore.peek() // never .reload() from a remote
```

This is the same "reload-on-access, single source of truth" shape as
[`cross-tab-coordination-with-web-locks.md`](../recipes/cross-tab-coordination-with-web-locks.md)
— a shared-runtime host and a cross-tab credential store are two different substrates hitting the
same underlying failure mode, which is good independent corroboration that the pattern
generalizes rather than being specific to either substrate.

## 3. Different teardown timings need different subscriptions

A remote's cleanup responsibilities often fire at genuinely different times relative to the host's
own lifecycle — some things need to tear down when the *specific remote instance* unmounts, others
only when the *host itself* is going away. Cramming both into one teardown function is a common
source of deadlocks: a cleanup step that should only run on host-teardown gets triggered on every
remote unmount, and ends up tearing down shared state a still-alive remote instance depends on
(the concrete failure mode this was extracted from was a dialog that could never be reopened,
because its shared open/close state had been torn down by an unrelated remote's unmount).

**Fix**: register teardown as two separate subscriptions with different lifetimes, not one
function called from two places:

```ts
onRemoteUnmount(() => releaseThisInstanceOnly())
onHostTeardown(() => releaseSharedState())
```

## Why sandboxed micro-frontends don't have this problem

An `iframe`-sandboxed sub-app cannot import a live reference to the host's in-memory module state
at all — everything crosses the boundary as serialized messages. That closes off all three race
conditions above by construction, at the cost of the serialization/message-passing overhead a
shared-realm integration is specifically trying to avoid. Neither approach is strictly better;
picking shared-realm integration means deliberately taking on these three failure modes in
exchange for its performance and ergonomics benefits — which is why they need to be designed for
explicitly rather than discovered in production.
