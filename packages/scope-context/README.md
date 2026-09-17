# scope-context

A scope-bound bundle of storage, cache, request, comms, and theme adapters, created once per
scope (tenant/org/session) — so "this scope's requests can only ever land in this scope's
cache" is true by construction, not a naming convention every call site has to remember.

Every axis is optional and independently pluggable. With no options, `createScopeContext` works
out of the box on zero-dependency defaults: an in-memory cache, an in-memory (ephemeral) storage
adapter, `fetch`, `BroadcastChannel`, and an empty CSS-variable theme.

```ts
import { createScopeContext } from 'scope-context'

const orgA = createScopeContext('org-a')
const orgB = createScopeContext('org-b')

await orgA.request.query('memo-list', () => fetchMemoList('org-a'))
orgB.cache.get('memo-list') // undefined — never wired to org A's cache
```

For real integrations, swap in `scope-context-tanstack-query` (cache), `scope-context-dexie`
(storage), `scope-context-penpal` (comms), and `scope-context-react`/`scope-context-vue` for
component-tree wiring — see the [monorepo README](../../README.md).

## Multiple scopes alive at once

Pair with [`scope-manager`](../scope-manager)'s `ScopeManager<ScopeContext>` — `destroy()` is
already shaped to be a `disposeScope` callback:

```ts
import { ScopeManager } from 'scope-manager'
import { createScopeContext } from 'scope-context'

const scopes = new ScopeManager({
  createScope: (scopeId) => createScopeContext(scopeId),
  disposeScope: (ctx) => ctx.destroy(),
})

scopes.getOrCreate('org-a') // both alive simultaneously —
scopes.getOrCreate('org-b') // e.g. a split-screen view showing both orgs' panels
```

## Theming

```ts
const ctx = createScopeContext('org-a', {
  createTheme: () => createStaticThemeAdapter({ tokens: { '--scope-primary': '#1a73e8' } }),
})
ctx.theme.setTheme({ tokens: { '--scope-primary': '#e81a4d' } }) // runtime swap, e.g. rebrand
```

`scope-context-react`/`-vue`'s `<ScopeProvider>` applies `theme.tokens` as CSS custom properties
on a wrapping element by default, so two coexisting providers never clash — no Shadow DOM needed.

MIT licensed.
