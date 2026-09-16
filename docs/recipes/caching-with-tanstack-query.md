# Caching with TanStack Query

Don't build a cache engine. Deduplication, stale-while-revalidate / cache-first / network-first
policies, and layered invalidation by key prefix are all solved problems — [TanStack
Query](https://tanstack.com/query) (or SWR) already does them well, and re-implementing a cache
engine from scratch just to get scoping right is not a good trade.

What's missing from an out-of-the-box setup is a thin, enforced convention: **scope has to be a
structural part of the query key, not something every call site has to remember to add.**

## Query keys: scope first, always

```ts
import { buildScopedKey } from 'scope-manager'

const memoListKey = (orgId: string, workspaceId: string) =>
  ['memo-list', buildScopedKey(orgId, workspaceId)] as const

useQuery({
  queryKey: memoListKey(currentOrgId, currentWorkspaceId),
  queryFn: () => fetchMemoList(currentOrgId, currentWorkspaceId),
})
```

Put the scope in the key even if the fetcher itself doesn't need it for the network call — the
key is what TanStack Query uses to decide whether two calls are "the same request" and whether an
invalidation touches a given entry. If scope isn't in the key, a network layer that resolves
identity from a header (auth token, active tenant) instead of an explicit parameter can silently
serve org A's cached response to a request nominally made under org B.

On sign-out / tenant switch, invalidate by prefix instead of clearing everything:

```ts
queryClient.removeQueries({ queryKey: ['memo-list', orgId] })
```

## The gap TanStack Query doesn't close: delete races

TanStack Query's own maintainers [acknowledge that optimistic-update + delete races don't have a
clean built-in solution](https://github.com/TanStack/query/discussions) — `cancelQueries()`
reduces the odds but doesn't eliminate them. A response for a request issued *before* a delete can
still resolve *after* the delete and silently resurrect the deleted row.

The fix is a small tombstone set kept outside the cache, checked before any write:

```ts
const tombstones = new Map<string, number>() // key -> deletedAt
const TOMBSTONE_TTL_MS = 60_000

function recordDelete(key: string) {
  tombstones.set(key, Date.now())
}

function isTombstoned(key: string): boolean {
  const deletedAt = tombstones.get(key)
  if (deletedAt === undefined) return false
  if (Date.now() - deletedAt > TOMBSTONE_TTL_MS) {
    tombstones.delete(key)
    return false
  }
  return true
}

// in the query's onSuccess / setQueryData path:
if (isTombstoned(rowKey)) return // drop the late response instead of writing it back
```

This is ~15 lines, not a package. Don't formalize it further than this unless you find yourself
copy-pasting it across more than two or three call sites.

## Authorization-sensitive data: skip the cache layer entirely

Don't reach for a short TTL as a substitute for "this must never be cached." Permission checks,
share/visibility metadata, and anything else where staleness is a security property — not just a
UX one — should bypass the cache layer outright rather than trusting a timer.

## Don't cache a business failure as a success

`fetch()` resolving with HTTP 200 is not the same thing as "this response should be cached."
Gate writes to the cache behind an explicit success predicate:

```ts
queryFn: async () => {
  const res = await fetchMemoList(orgId, workspaceId)
  if (res.code !== 0) throw new Error(res.message) // let TanStack Query treat it as an error, not a cache-worthy result
  return res.data
}
```
