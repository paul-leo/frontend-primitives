# Cross-tab coordination with the Web Locks API + BroadcastChannel

Any system with multiple independent execution contexts (browser tabs, Electron
`BrowserWindow`s, and eventually independent processes) sharing one piece of state — a login
credential, a config value, collaborative metadata — runs into two coupled but distinct problems:
avoiding redundant expensive work (multiple contexts all refreshing the same about-to-expire
token), and propagating a change from one context to the others quickly and without an echo loop.

Neither problem needs the heaviest tools in the distributed-systems toolbox (leader election,
CRDTs). A best-effort advisory lock plus last-write-wins broadcast is enough for the overwhelming
majority of cases — as long as you write down explicitly that this is the model you're accepting,
and its limits.

`navigator.locks` and `BroadcastChannel` already provide the transport and lock primitives. What's
missing is a small amount of glue code, below, for the parts that are genuinely easy to get wrong.

## Principle 1: reload, don't trust the in-memory copy, before a cross-context decision

A persisted store (`localStorage`, a cookie, IndexedDB) is the one source of truth for
cross-context state. Any in-memory copy can go stale the instant *another* context touches the
shared store — and the context holding the stale copy has no way to know that happened.

```ts
export interface ReloadableSharedValue<T> {
  reload(): T | undefined // force a real read from the shared store
  peek(): T | undefined // read the in-memory cache only, never touches storage
}

export function createReloadableSharedValue<T>(
  storageKey: string,
  codec: { encode(v: T): string; decode(s: string): T },
): ReloadableSharedValue<T> {
  let cached: T | undefined

  return {
    reload() {
      const raw = localStorage.getItem(storageKey)
      cached = raw === null ? undefined : codec.decode(raw)
      return cached
    },
    peek() {
      return cached
    },
  }
}
```

Call `reload()` — not `peek()` — immediately before any cross-context-sensitive decision (is the
user still logged in? is this token still valid?). This pattern alone accounted for three
independent real incidents in the system this was extracted from: a stale "logged out" false
positive after another window refreshed a token, a pre-warmed window reading its auth SDK's
pre-login memory snapshot, and a `clear()` that emptied memory but not storage, sending a retry
loop into an infinite spin instead of a clean re-login.

## Principle 2 & 3: an advisory lock, with a signal for "did I just wait on someone"

`createWebLocksLock()` and `createNoopLock()` now ship in [`scope-manager`](../../packages/scope-manager)
rather than being copy-pasted per project — this specific piece turned out to be fully
self-contained (no project-specific wiring needed, just `lock.run(name, fn)`), unlike the rest of
this recipe:

```ts
import { createWebLocksLock, createNoopLock, type LockRunInfo } from 'scope-manager'

const lock = createWebLocksLock() // falls back to createNoopLock() manually if navigator.locks is unavailable

await lock.run('refresh-token', async (info: LockRunInfo) => {
  if (info.contended) {
    // We waited on another tab's lock — it very likely already did this work. Re-read
    // the shared store (see ReloadableSharedValue below) instead of redoing it blindly.
  }
  // ...do the actual refresh...
})
```

`contended` is a more reliable "did someone else probably already do this" signal than
re-checking whether the shared state merely "looks" fresh — staleness can also come from clock
skew or a partial write, whereas "I just waited on someone else's lock" is a direct fact. The
implementation uses a two-phase probe (`{ ifAvailable: true }` first) and runs the caller's work
*inside* that same probe callback when it succeeds, rather than releasing and re-requesting — this
closes a race window that a naive two-request implementation would otherwise reopen.

This is also the one piece of this recipe with a concrete, citable reason to prefer the native API
over the most popular userland alternative: [`browser-tabs-lock`](https://github.com/supertokens/browser-tabs-lock)
(the most-used tab-mutex package, predating `navigator.locks`) has had a real mutual-exclusion
bug where a second requester could break the lock. `navigator.locks` is implemented by the browser
itself and doesn't carry that class of bug.

`createNoopLock()` is the graceful degradation path for environments where `navigator.locks` isn't
available (older browsers, single-process apps) — falling back to never blocking, not throwing.

## Principle 4: bridge a lock across two separate lifecycle callbacks

Some integrations need "should I skip this expensive step" decided at one point in the code and
"was it actually done" recorded at another — e.g. `onBeforeRefresh` / `onAfterRefresh` hooks in an
SDK, where a single synchronous critical section doesn't fit the shape.

```ts
export interface LockBridge {
  before(skipIf?: (info: LockRunInfo) => boolean): Promise<{ shouldRun: boolean }>
  after(result: unknown): Promise<void>
}

export function createLockBridge(lock: SharedLock, name: string): LockBridge {
  let release: (() => void) | undefined
  return {
    async before(skipIf) {
      let contended = false
      await new Promise<void>((resolve) => {
        void lock.run(name, async (info) => {
          contended = info.contended
          await new Promise<void>((releaseLock) => {
            release = releaseLock
            resolve()
          })
        })
      })
      return { shouldRun: !(skipIf?.({ contended }) ?? false) }
    },
    async after(_result) {
      release?.()
      release = undefined
    },
  }
}
```

## Principle 5 & 6: last-write-wins, with roles instead of per-message echo checks

Conflict resolution for cross-tab UI state rarely needs to be more sophisticated than "the most
recent write wins" — vector clocks and CRDT merges are solving a harder problem than most cross-tab
sync needs. For echo prevention, a `source`/`replica` role is simpler and harder to get wrong than
tagging every message with a sender id and checking it on receipt: a replica simply never
re-publishes what it receives, and only the source ever answers another context's pull request.

## Principle 7 & 8: transports are pluggable, and know their own blind spots

`storage` events are not reliable across Electron `BrowserWindow`s — `BroadcastChannel` has to be
the primary transport there, with `storage` as a fallback rather than the other way around. Design
both the lock and the transport as injectable interfaces from the start, so a heavier coordination
mechanism (e.g. a main-process-arbitrated lock service) can replace either primitive later without
touching consumer code.

```ts
export interface SharedChannelTransport {
  publish(raw: string): void
  subscribe(handler: (raw: string) => void): () => void
}

export interface SharedChannel<T> {
  getLocal(): T | undefined
  publish(value: T, updatedAt?: number): void
  subscribe(handler: (value: T, updatedAt: number) => void): () => void
  mutate<R>(fn: () => Promise<{ value: T; result: R }>, opts?: { skipIf?: (current: T | undefined) => boolean }): Promise<R>
}

export function createSharedChannel<T>(
  name: string,
  options: { role: 'source' | 'replica'; transports: SharedChannelTransport[]; lock?: SharedLock },
): SharedChannel<T> {
  let local: { value: T; updatedAt: number } | undefined
  const listeners = new Set<(value: T, updatedAt: number) => void>()

  for (const transport of options.transports) {
    transport.subscribe((raw) => {
      const incoming = JSON.parse(raw) as { value: T; updatedAt: number }
      if (local && incoming.updatedAt <= local.updatedAt) return // last-write-wins
      local = incoming
      listeners.forEach((listener) => listener(incoming.value, incoming.updatedAt))
    })
  }

  return {
    getLocal: () => local?.value,
    publish(value, updatedAt = Date.now()) {
      local = { value, updatedAt }
      if (options.role !== 'source') return // replicas never re-publish what they hold
      for (const transport of options.transports) {
        transport.publish(JSON.stringify({ value, updatedAt }))
      }
    },
    subscribe(handler) {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
    async mutate(fn, opts) {
      const run = async () => {
        if (opts?.skipIf?.(local?.value)) return undefined as never
        const { value, result } = await fn()
        this.publish(value)
        return result
      }
      return options.lock ? options.lock.run(name, run) : run()
    },
  }
}
```

This is glue code around two mature transports, not a new engine — that's exactly why it's a
recipe here instead of a maintained package.
