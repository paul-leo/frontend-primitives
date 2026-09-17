# Architecture

This document explains *why* this repo is shaped the way it is: the problem class it targets,
the one idea every package is an application of, how the packages compose, and — as
importantly — what we deliberately chose not to build and why. See each package's own README
for API reference; this is the design rationale that sits above all of them.

## The problem class

Every package here traces back to the same recurring failure mode in multi-instance,
multi-tenant frontend systems (micro-frontends, multi-window desktop apps, multi-session SaaS):
**a boundary that only exists as a convention gets crossed the moment someone forgets to apply
it.** A cache key that's supposed to include a tenant id but doesn't on one code path. A
registry keyed by a bare instance id that collides once two sessions are open at once. A
service worker that treats a versioned resource and its unversioned entry point the same way. A
shared module in a micro-frontend host that gets consumed before it's actually initialized.

None of these are exotic bugs. They're the default outcome of leaving an isolation boundary as
something engineers have to *remember*, rather than something the type system or object graph
*enforces*. This repo is eight independent instances of finding that failure mode, and encoding
the fix as a reusable primitive instead of a one-off patch.

## Core thesis

> Scope — whatever "scope" means for your system: a tenant, a session, an open document, a
> pooled instance — has to be a structural part of your key/type structure, not an implicit
> convention every call site has to remember to apply.

Every package is one application of this idea, at a different layer:

| Layer | Package | The convention it replaces |
|---|---|---|
| A single registry of per-scope values | `scope-manager` | A global singleton, or a map keyed by a bare id that different scopes can collide on |
| Pooling non-component resources | `instance-pool` | Ad-hoc "is this iframe/worker still valid" bookkeeping scattered across call sites |
| Rolling out a new version of related resources | `atomic-rollout` | "The entry point is new, hope the referenced assets are too" |
| Storage + cache + request + comms + theme, bundled | `scope-context` | Passing a `scopeId` string into four unrelated functions and trusting each one to use it |

## Package map

```
scope-manager (zero deps)
  ├─ instance-pool
  ├─ atomic-rollout
  └─ scope-context
       ├─ scope-context-tanstack-query  (peer: @tanstack/query-core)
       ├─ scope-context-dexie           (peer: dexie)
       ├─ scope-context-penpal          (no real dependency on the `penpal` package —
       │                                  structurally compatible with any two-way RPC bridge)
       ├─ scope-context-react           (peer: react)
       └─ scope-context-vue             (peer: vue)
```

Nothing here depends on a UI framework except the two binding packages, and nothing in
`scope-context`'s core depends on any of TanStack Query, Dexie, or Penpal — pull in only the
adapters you actually use.

## `ScopeManager<T>`: the one primitive everything else composes

```ts
class ScopeManager<T> {
  getOrCreate(scopeId: string): T       // calls createScope(scopeId) at most once per id, reuses after
  destroy(scopeId: string): boolean     // calls disposeScope(value, scopeId) exactly once
  epoch(scopeId: string): number        // monotonic, bumps on every destroy
}
```

This is deliberately the *only* registry primitive in the repo. `LruScopeManager<T>` adds a
capacity bound (evicting the least-recently-touched scope); `instance-pool`'s claim/release/
cooldown state machine and the "Controller/Manager" pattern
([`docs/patterns/controller-manager.md`](./docs/patterns/controller-manager.md)) are both just
consumers of this one registry, not separate primitives. When a later package
(`scope-context`) needed a way to manage many scopes' bundles alive at once, the answer was
`ScopeManager<ScopeContext>` — not a new kind of registry.

The `epoch()` counter exists because "snapshot a version number before an async operation,
compare it on resume, discard the result if it moved" is a recurring shape for discarding stale
work safely — cheaper and more composable than threading an `AbortController` through every
consumer, and it doesn't assume only one operation is ever in flight.

## `scope-context`: the six-axis bundle

The three earlier packages each replace one scattered convention with one structural rule. The
gap they left: a consumer still has to independently apply that rule across *storage*, *cache*,
*request*, *comms*, and (for multi-tenant UI) *theme* — and nothing stops those four or five
independently-applied rules from drifting out of sync with each other. `scope-context` closes
that gap by making all of them facets of one object, created once per scope:

```ts
interface ScopeContext<M = undefined> {
  readonly scopeId: string
  readonly storage: ScopeStorageAdapter
  readonly cache: ScopeCacheAdapter
  readonly request: ScopeRequestAdapter
  readonly comms: ScopeCommsAdapter
  readonly theme: ScopeThemeAdapter
  readonly memory: M
  destroy(): Promise<void>
}
```

### The structural guarantee, precisely

The property we actually want — "this scope's requests can only ever land in this scope's
cache" — is not implemented as a rule anyone follows. It's implemented as an object reference:

```ts
createScopeContext(scopeId, {
  createCache: (scopeId) => /* build this scope's cache */,
  createRequest: (scopeId, cache) => /* cache is ALREADY the resolved value above */,
})
```

`createRequest`'s second parameter is always the exact `ScopeCacheAdapter` instance that was
just built for this exact scope — never a different one, and never re-derived by looking up a
shared registry with a string key. The test suite proves this by construction, not by
inspection: `scope-context`'s test suite includes a `createRequest` implementation that
*deliberately ignores its own `scopeId` argument* and only ever uses the `cache` closure
argument — and it still cannot write into another scope's cache, because it was never handed a
reference to one. That's the difference between "isolated by convention" and "isolated by
construction": the convention-based version can be defeated by a single missed parameter
somewhere; the construction-based version has no code path that reaches the wrong object at all.

### Why five axes are optional, not required

`createScopeContext(scopeId)` with zero options works out of the box on zero-dependency
defaults — an in-memory cache, an intentionally-ephemeral in-memory storage adapter, `fetch`,
`BroadcastChannel`, and an empty CSS-variable theme. You only supply a `create*` factory for the
one axis you're customizing. This matters for two reasons: it keeps the 80% case (one axis
customized, four left default) from paying a five-factory-functions tax, and it means the
"zero-dependency core, opt-in integrations" split (below) doesn't leak into ergonomics.

### Why the integrations are separate packages, not options on one function

`scope-context` itself has exactly one dependency (`scope-manager`) and zero third-party
runtime dependencies. `scope-context-tanstack-query`, `-dexie`, and `-penpal` each peer-depend
on exactly the one library they wrap, and the two framework bindings (`-react`, `-vue`) know
nothing about any of the three. A consumer who wants React + Dexie only installs
`scope-context`, `scope-context-react`, `scope-context-dexie` — never TanStack, never Penpal,
never Vue. This is the same "don't force a shared brand/bundle on unrelated concerns" judgment
that shaped the package *naming* scheme too (see below) — applied to dependency graphs instead
of names.

One specific consequence worth calling out: `scope-context-tanstack-query` peer-depends on
`@tanstack/query-core` — the framework-agnostic engine — not `@tanstack/react-query` or
`@tanstack/vue-query`. Mounting `<QueryClientProvider client={ctx.cache.client}>` around the
resulting `QueryClient` is the *consumer's* app code; `scope-context-react` never needs to know
TanStack Query exists, and `scope-context-tanstack-query` never needs to know React exists.

`scope-context-penpal` goes a step further: it does not literally import the `penpal` npm
package at all. Penpal (like Comlink, or any RPC library built on bidirectional method calls)
has no native publish/subscribe — only method calls in each direction — so the adapter's real
contract is a small structural `PenpalBridge` interface (`sendToRemote`/`onReceiveFromRemote`)
that any such library can satisfy. The package is *named* for its primary documented use case,
not coupled to it by import.

### Theming as a fifth axis, not a special case

A later requirement — different organizations rendering with different visual themes,
simultaneously, on one screen — turned out to fit the same shape as the other four axes rather
than needing a different mechanism. `ScopeThemeAdapter` holds `{ tokens, className }`
(CSS custom properties plus an optional class name) with `getTheme`/`setTheme`/`subscribe`.
`<ScopeProvider>` applies `theme.tokens` as inline CSS custom properties on a wrapping element by
default — which is enough for two coexisting providers to never clash, with zero Shadow DOM and
zero CSS-in-JS library coupling, because CSS custom properties already cascade per DOM subtree.
`applyTheme={false}` is the escape hatch for layouts that can't tolerate the extra wrapper
element; `useScopedTheme()` then lets the consumer apply the tokens wherever they choose.

### Framework bindings: umbrella hook first

`scope-context-react`/`-vue` expose `useScope()` (React) / `useScope()` + `provideScope()`
(Vue) as the primary API, with `useScopedStorage`/`useScopedCache`/`useScopedRequest`/
`useScopedComms`/`useScopedTheme`/`useScopedMemory` as one-line derivations for narrower typing
in leaf components. This mirrors two existing ergonomics precedents rather than inventing a
third shape: `@tanstack/react-query`'s single `useQueryClient()` hook, and React-Redux's
`useSelector` (a narrowing tool layered over one store/context, not a family of pre-named
per-slice hooks). Vue's DI key is a `Symbol`, not a string — the same "identity should be
structural, not a string someone could collide with" thesis as `scope-manager`'s
`buildScopedKey`, applied to Vue's `provide`/`inject`.

## `instance-pool`: pooling what component-level tools can't

`<KeepAlive>` (Vue) and `react-activation` (React) already solve "keep N components alive,
keyed, with a capacity bound" — `instance-pool` exists specifically for what those tools
*cannot* manage: non-component resources (an iframe running an independent JS realm, a worker,
a raw connection) where "keep it alive" means more than "don't unmount the DOM node." Its
`idle → claimed → destroyed` state machine, cooldown-before-teardown, and construction-time
`onInstanceCreated` hook (independent of whether/when an instance is ever claimed) all come from
the same underlying `LruScopeManager` — the pool is an application of the registry, not a
reimplementation of one.

An ecosystem check before building this confirmed it's a genuine, if narrow, gap: neither
qiankun nor single-spa (the two most-used non-Module-Federation micro-frontend frameworks)
ship built-in instance pooling or pre-warming.

## `atomic-rollout`: a protocol, not a caching strategy

The failure mode this targets — a host's entry point pointing at a new version while the
resources it references haven't finished loading, producing a broken or blank state — is a
*named, unsolved, ecosystem-wide gap*, not a hypothetical: qiankun's `import-html-entry` has a
documented `embedHTMLCache` issue with no built-in fix, Module Federation's `remoteEntry.js`
cache-invalidation problems have their own name in the community ("The Module Federation Cache
Invalidation Nightmare"), and wujie's own documentation doesn't address it at all. Two
independent implementations of essentially the same fix — a Service-Worker-based one and a
Module-Federation-based one — converge on the identical five-phase shape, which is itself
corroborating evidence that this is one problem with one answer, not two coincidentally similar
ones.

`createRolloutCoordinator()` implements that shape — `check → warm → verify → promote →
commit` — as a protocol layer that sits between "fetch the entry pointer" and "actually execute
it," independent of whether the loader underneath is a bare `fetch`, qiankun, Module
Federation, or a hand-rolled Service Worker. It is explicitly *not* built on top of Workbox:
Workbox solves a single application's own PWA caching, a different problem from a host loading
an independently-deployed remote resource.

Every phase transition is guarded by a specific, test-covered failure mode: `verify` re-reads
the actual resource store rather than trusting that a `warm` promise resolving means the bytes
landed; `promote` is preceded by a structural check that the entry pointer's referenced resource
ids exactly match the warmed batch (not just "some update happened"); the check phase fails
*open* (`hasUpdate: true`) on any ambiguity (unreachable manifest, malformed response, timeout),
because silently reporting "you're up to date" when the true answer is unknown can strand a
session in a broken state.

## Cross-cutting design principles

These recur across all four packages and are worth naming once instead of re-deriving per
package:

- **Fail-closed for isolation boundaries, fail-open for staleness ambiguity.** A message
  without sender attribution, or an unparseable payload, is dropped
  (`scope-context-penpal`'s `createFilteredCommsAdapter`) — silence is safer than guessing when
  the risk is cross-scope leakage. An unreachable version manifest reports `hasUpdate: true`
  (`atomic-rollout`) — silence is *not* safer when the risk is stranding a session that
  genuinely needs an update in a broken read-only state. Which default is correct depends on
  which failure mode is worse, not on a single rule of thumb.
- **One primitive, composed differently, beats a family of specialized primitives.**
  `ScopeManager<T>` backs a plain registry, an LRU-bounded pool, a "Manager" in the
  Controller/Manager pattern, and a bag of live `ScopeContext` bundles. Adding a new use case
  did not add a new registry class.
- **A structural guarantee beats a documented rule wherever it's actually achievable.** Where
  it's cheap to make the wrong outcome literally unreachable (the cache-reference-passing in
  `scope-context`, the Symbol DI key in `scope-context-vue`), do that instead of writing "please
  remember to..." in a comment.
- **Every isolation boundary needs one first-class extension point for "the thing every
  instance needs regardless of when/whether it's used."** `instance-pool`'s
  `onInstanceCreated` and `scope-context`'s per-scope `destroy()` fan-out both exist because
  "attach common setup" and "always tear everything down, in the same way, from any dispose
  path" turned out to need one dedicated hook rather than N call sites each remembering to do
  it.

## Build vs. buy: what we composed instead of building

Before writing any of the above, each of six candidate directions was checked against existing
mature tooling, adversarially — not "does anything superficially similar exist," but "does an
existing library solve the *same* problem, and is it actually good and convenient to use."
Four directions turned out to be largely solved already:

| Problem | What already solves it | The residual, package-worthy gap |
|---|---|---|
| Caching / dedup | TanStack Query (`@tanstack/query-core`) | Structural scope binding (`scope-context-tanstack-query`) |
| Persistent storage | Dexie.js | Same — plus the documented `on('blocked')`/`on('versionchange')` wiring |
| Cross-tab locking/broadcast | `navigator.locks`, `BroadcastChannel` | A thin, copy-pasteable glue layer — deliberately kept as a [recipe](./docs/recipes/cross-tab-coordination-with-web-locks.md), not a package, because the glue needs project-specific wiring that packaging wouldn't remove |
| Cross-instance messaging | Penpal, PostRobot, `BroadcastChannel` | Fail-closed sender attribution (`scope-context-penpal`) |

Two directions were confirmed as genuine, if narrow, ecosystem gaps and became full packages
(`instance-pool`, `atomic-rollout`, see above). A follow-up adversarial competitive pass (after
the packages existed) specifically tried to find superior *published* alternatives rather than
confirm the initial research — see `browser-tabs-lock`'s documented mutual-exclusion bug (cited
in the cross-tab-coordination recipe as concrete evidence for preferring the native Web Locks
API), and Jotai's own acknowledged `atomWithBroadcast` cold-start bug (the same failure class
`ReloadableSharedValue`'s "reload, don't trust memory" principle exists to prevent). Finding
real, citable bugs in the most popular incumbent tools was treated as *stronger* validation than
finding nothing, because it means the design choices here are responses to specific known
failure modes, not defensive hedging.

A third pass specifically stress-tested `scope-manager`'s core registry idea against
heavier-weight prior art from adjacent domains — NestJS's request-scoped DI, Angular's
hierarchical injectors, Microsoft Orleans' virtual actors, Erlang/OTP supervision trees. None of
them turned out to be a drop-in replacement (each solves a related-but-different problem: DI
graph propagation, component-tree-scoped injector cascades, distributed single-threaded
execution guarantees, or process-level crash isolation — none of which a browser-context
registry needs by default), but the comparison surfaced concrete, real gaps worth naming even
though none has been acted on yet:

- No per-scope execution serialization (Orleans' single-threaded-per-grain guarantee has no
  analogue here — two concurrent async callers can race on the same `ScopeManager` entry, and
  `epoch()` only detects staleness after the fact rather than preventing the race).
- No automatic parent→child disposal cascade for nested `ScopeManager`s (Angular's injector tree
  tears down child injectors automatically; a nested Controller/Manager here needs the outer
  `disposeScope` to manually call the inner registry's `destroyAll()`).
- No bounded crash/restart accounting for a `createScope` factory that fails repeatedly (a
  lightweight echo of OTP's supervision strategies, well short of true process isolation, which
  JavaScript doesn't have without workers).

These are recorded as known, evidence-backed candidate improvements — not implemented, because
none of the three problems has surfaced as a real incident yet, and speculative hardening
without a triggering failure is exactly the kind of premature abstraction this repo's own
thesis argues against.

## What we deliberately did not build

- **A hard, browser-enforced realm boundary per scope** (a real `<iframe>` per tenant, or a
  `sandbox` attribute without `allow-same-origin` to get an opaque origin with automatic storage
  partitioning) was explored and explicitly rejected as *this repo's* job. It's a real,
  stronger isolation option — cross-origin iframes give storage/cookie isolation for free from
  the browser itself — but it composes with `scope-context` rather than replacing it: nothing
  here prevents wrapping a `ScopeContext` inside such a boundary later, and `instance-pool`
  already provides the iframe-lifecycle half of that if it's ever built.
- **A CRDT-based conflict resolution layer.** Yjs/Automerge are more principled than
  last-write-wins for genuinely concurrent, structurally-decomposable data (collaborative text,
  ordered lists) — but even Automerge's own scalar/key-value fields use LWW registers
  internally, which is the concrete evidence that LWW-by-timestamp is an accepted, sufficient
  simplification for this repo's actual problem class (config values, "who does the token
  refresh"), not a corner cut.
- **A unified adapter package with subpath exports** instead of six independent packages. Six
  packages costs more publishing overhead than one with `scope-context-adapters/tanstack-query`
  subpaths would, but it matches this repo's existing one-package-one-purpose convention exactly
  and avoids one adapter's type error failing typecheck for the other two.

## Testing philosophy

Every test in this repo maps to a specific design principle or a specific way the corresponding
convention-based version has failed in practice — not coverage-for-its-own-sake. The clearest
example is `scope-context`'s cross-scope isolation test: it doesn't just assert two caches are
different objects, it constructs a `createRequest` implementation that actively tries to ignore
scope identity and confirms it *still* cannot leak, because the guarantee is structural. Where a
real bug class exists in a dependency (Dexie's `versionchange` race), the test triggers the real
event via a second live `Dexie` connection rather than mocking the scenario away.

## Where to go next

- [`docs/recipes/`](./docs/recipes) — thin, copy-pasteable adapter layers over mature libraries,
  for the axes that didn't warrant a package.
- [`docs/patterns/`](./docs/patterns) — architectural composition guidance that isn't code:
  the Controller/Manager pattern, and shared-realm (Module Federation-style) coordination
  hazards that sandboxed micro-frontends don't structurally have.
- Each package's own README for API reference and install instructions.
