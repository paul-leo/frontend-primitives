# Persistent storage with Dexie.js

> Need this isolated across storage, cache, requests, and comms *together*, as a structural
> guarantee rather than a convention applied at each call site? See
> [`scope-context`](../../packages/scope-context) and its
> [`scope-context-dexie`](../../packages/scope-context-dexie) adapter, which wraps this exact
> recommendation (including the `on('blocked')`/`on('versionchange')` handling below).

Don't hand-roll an IndexedDB wrapper. [Dexie.js](https://dexie.org/) already handles the sharp
edges of the raw API, including the two failure modes below that are easy to get wrong from
scratch.

## Database naming: scope goes in the database name, not just the records

```ts
import Dexie from 'dexie'
import { buildScopedKey } from 'scope-manager'

function openScopedDb(orgId: string, userId: string) {
  const db = new Dexie(buildScopedKey('memo-offline', orgId, userId))
  db.version(1).stores({ items: 'id, updatedAt' })
  return db
}
```

This mirrors [Dexie Cloud's own convention](https://dexie.org/cloud/) of suffixing the database
name by tenant. A single shared database with an `orgId` *column* is a weaker isolation boundary
than a separate database per scope — a bug that forgets to filter by `orgId` in a query fails
open (returns everyone's rows) rather than failing closed (can't see another scope's database at
all).

## The flagship failure mode: `indexedDB.open()` can hang forever

If another tab/connection has the same database open with an older schema version, a plain
`indexedDB.open()` call can sit in a **silent, unbounded hang** — no error, no timeout, nothing in
the console. From the user's point of view, "reopen after re-login" just never finishes. Dexie
exposes the two events you need to handle this instead of discovering it in production:

```ts
db.on('blocked', () => {
  // Another connection (often a stale background tab) is holding an older version open.
  // Surface this to the user / retry with backoff — do NOT let this hang silently.
  reportBlockedDbOpen(db.name)
})

db.on('versionchange', () => {
  // Another connection is upgrading the schema. Close cooperatively so it can proceed,
  // rather than becoming the connection that blocks it.
  db.close()
})
```

## The regression that follows the first fix: partial invalidation

Once you wire up cooperative `close()` on `versionchange`, make sure every in-flight consumer of
the database actually re-opens rather than continuing to hold a reference to a promise that
resolved *before* the close. A common bug shape: an `initPromise` cached at module scope resolves
once, gets reused by every subsequent caller, and after a cooperative close nobody notices the
connection underneath it is now dead — reads silently return stale or empty results instead of
throwing. Treat "the db was closed out from under us" as a first-class state, not an edge case:
invalidate the cached open-promise in the `versionchange` handler, not just the connection.

## Quota / TTL eviction

Don't write your own LRU eviction on top of Dexie. Pair it with
[`lru-cache`](https://www.npmjs.com/package/lru-cache) (or any off-the-shelf LRU) keyed by the
same scoped identifiers, and let Dexie's bulk `delete`/`bulkDelete` do the actual row removal.
"Rebuild the cache from scratch after eviction" is a business-logic decision specific to your data
shape — that part is still yours to write.
