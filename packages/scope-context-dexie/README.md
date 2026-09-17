# scope-context-dexie

A [`scope-context`](../scope-context) storage adapter backed by [Dexie.js](https://dexie.org/) —
one independent IndexedDB database per scope, with `on('blocked')`/`on('versionchange')` wired
in per [`docs/recipes/persistent-storage-with-dexie.md`](../../docs/recipes/persistent-storage-with-dexie.md).

```ts
import { createScopeContext } from 'scope-context'
import { createDexieStorageAdapter } from 'scope-context-dexie'

const ctx = createScopeContext('org-a', {
  createStorage: createDexieStorageAdapter({
    onBlocked: (dbName) => reportBlockedDbOpen(dbName),
    onVersionChange: (dbName) => console.warn(`${dbName} closed for a schema upgrade`),
  }),
})

await ctx.storage.set('token', 'abc')
```

Each scope gets its own database (`buildScopedKey(dbNamePrefix, scopeId)`), not a shared
database with a scope-id column — a bug that forgets to filter by scope fails *closed* (can't
see another scope's database) instead of failing open.

MIT licensed.
