# scope-manager

A tiny, dependency-free registry for lazily creating, reusing, and tearing down one value per
scope — plus an LRU-capacity variant and two small primitives (`OccupancyGate`, `RefreshGuard`)
that show up alongside it.

See the [monorepo README](../../README.md) for the full picture, and
[`docs/patterns/controller-manager.md`](../../docs/patterns/controller-manager.md) for how this
composes into the "Controller/Manager" pattern.

```ts
import { ScopeManager, LruScopeManager, createOccupancyGate, createRefreshGuard, buildScopedKey } from 'scope-manager'

const perTenant = new ScopeManager({
  createScope: (tenantId) => createTenantState(tenantId),
  disposeScope: (state) => state.dispose(),
})

perTenant.getOrCreate('tenant-42') // created once, reused after
```

## API

- `ScopeManager<T>` — `getOrCreate`, `get`, `has`, `destroy`, `destroyAll`, `list`, `size`, `epoch`
- `LruScopeManager<T>` — `ScopeManager<T>` with a `maxSize` capacity bound
- `createOccupancyGate()` — synchronous claim/release/isClaimed mutex, self-exclusion aware
- `createRefreshGuard()` — monotonic sequence counter for discarding stale async responses
- `buildScopedKey(scope, ...parts)` — deterministic scope-first key builder
- `createWebLocksLock()` / `createNoopLock()` — best-effort cross-tab lock on top of the native
  Web Locks API, with a race-free two-phase probe exposing whether a run had to wait on another
  context's lock (`{ contended: boolean }`). See
  [`docs/recipes/cross-tab-coordination-with-web-locks.md`](../../docs/recipes/cross-tab-coordination-with-web-locks.md)
  for how this composes into a full cross-tab coordination setup.

MIT licensed.
