# frontend-primitives

Small, standalone TypeScript packages for problems that show up repeatedly in
multi-instance/multi-tenant frontend systems (micro-frontends, multi-window desktop apps,
multi-session SaaS) — extracted from real production incidents, each package solving exactly one
problem the wider ecosystem doesn't already solve well.

**Core thesis:** scope — whatever "scope" means for your system: a tenant, a session, an open
document, a pooled instance — has to be a structural part of your key/type structure, not an
implicit convention every call site has to remember to apply. Every package here is one
application of that idea.

## Packages

| Package | Solves | Don't need it if... |
|---|---|---|
| [`scope-manager`](./packages/scope-manager) | Lazily create/reuse/tear down one value per scope, with an optional LRU capacity bound, plus two small mutex/versioning primitives | You only ever have one instance of the thing you're managing |
| [`instance-pool`](./packages/instance-pool) | Pool non-component resources (iframes, workers, independent JS runtimes, connections) with pre-warm/claim/cooldown lifecycle | You're pooling plain framework components — use Vue's `<KeepAlive>` or `react-activation` instead |
| [`atomic-rollout`](./packages/atomic-rollout) | A loader-agnostic check→warm→verify→promote protocol so a host never ends up running a mix of old and new versions of a set of related remote resources | Your resources are content-addressed *and* your loader already refuses to mix versions across a deploy — most don't |
| [`scope-context`](./packages/scope-context) | A bundle of storage/cache/request/comms/theme adapters created once per scope, so "this scope's requests can only ever land in this scope's cache" is true by construction, not a convention | You only need one axis in isolation — reach for the matching recipe below instead |

`instance-pool`, `atomic-rollout`, and `scope-context` all depend on `scope-manager`; it is not
sold as a standalone solution to anything by itself.

### `scope-context` integration packages

| Package | Adapter for |
|---|---|
| [`scope-context-tanstack-query`](./packages/scope-context-tanstack-query) | Cache — one `QueryClient` per scope |
| [`scope-context-dexie`](./packages/scope-context-dexie) | Storage — one IndexedDB database per scope |
| [`scope-context-penpal`](./packages/scope-context-penpal) | Comms — fail-closed sender attribution over any two-way RPC transport |
| [`scope-context-react`](./packages/scope-context-react) | `<ScopeProvider>` + `useScope()` for React |
| [`scope-context-vue`](./packages/scope-context-vue) | `provideScope()`/`<ScopeProvider>` + `useScope()` for Vue |

Each integration package is independent — pull in only the adapters you actually use.
`scope-context-react`/`-vue` know nothing about TanStack Query, Dexie, or Penpal.

Four more directions were investigated, found already well-solved by existing tools, and written
up as recipes instead of shipped as packages — see [`docs/recipes/`](./docs/recipes) below.

## `ScopeManager<T>` in one picture

```
ScopeManager<T>
  ├─ getOrCreate(scopeId) ──▶ calls createScope(scopeId) at most once per scopeId, reuses after
  ├─ destroy(scopeId)     ──▶ calls disposeScope(value, scopeId) exactly once
  └─ epoch(scopeId)       ──▶ monotonic counter, bumped on every destroy — snapshot it before an
                              async op, compare on resume, discard if it moved
```

`LruScopeManager<T>` is the same thing with a `maxSize` — once exceeded, the least-recently-touched
scope is destroyed to make room. `instance-pool` and the "Controller/Manager" pattern
(see [`docs/patterns/controller-manager.md`](./docs/patterns/controller-manager.md)) are both just
applications of this one registry, not separate primitives.

## Quick start

```bash
pnpm add scope-manager
pnpm add instance-pool    # depends on scope-manager
pnpm add atomic-rollout   # depends on scope-manager
pnpm add scope-context scope-context-react   # or -vue; add tanstack-query/dexie/penpal adapters as needed
```

```ts
import { ScopeManager } from 'scope-manager'

const perTenantState = new ScopeManager({
  createScope: (tenantId) => createTenantState(tenantId),
  disposeScope: (state) => state.dispose(),
})

perTenantState.getOrCreate('tenant-42') // created once, reused after
```

```tsx
import { createScopeContext } from 'scope-context'
import { ScopeProvider, useScopedRequest } from 'scope-context-react'

const orgA = createScopeContext('org-a')
const orgB = createScopeContext('org-b')

// <ScopeProvider value={orgA}><OrgPanel /></ScopeProvider>   — left pane
// <ScopeProvider value={orgB}><OrgPanel /></ScopeProvider>   — right pane, fully isolated
```

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the design rationale that sits above all of these
  packages: the problem class, the structural-guarantee thesis, build-vs-buy research, and what
  was deliberately left out.
- [`docs/recipes/`](./docs/recipes) — where an existing library already solves most of the
  problem, and only a thin adapter layer is needed on top: caching, cross-instance messaging,
  persistent storage, cross-tab coordination.
- [`docs/patterns/`](./docs/patterns) — architectural composition guidance that isn't a package:
  the Controller/Manager pattern, and shared-runtime (Module Federation-style) coordination.

## Contributing / releasing

This is a pnpm workspace built with [Turborepo](https://turbo.build/) and versioned with
[Changesets](https://github.com/changesets/changesets).

```bash
pnpm install
pnpm build       # turbo build, dual ESM/CJS output per package
pnpm typecheck
pnpm test        # vitest across all packages
pnpm changeset    # describe a change before merging
```

## License

MIT — see [LICENSE](./LICENSE).
