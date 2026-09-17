# scope-context-tanstack-query

A [`scope-context`](../scope-context) cache/request adapter backed by
[TanStack Query](https://tanstack.com/query)'s framework-agnostic `@tanstack/query-core` — one
independent `QueryClient` per scope.

```ts
import { createScopeContext } from 'scope-context'
import { createTanStackQueryCacheAdapter, createTanStackQueryRequestAdapter } from 'scope-context-tanstack-query'

const ctx = createScopeContext('org-a', {
  createCache: createTanStackQueryCacheAdapter(),
  createRequest: createTanStackQueryRequestAdapter(), // must be paired with the cache adapter above
})

await ctx.request.query(['memo-list'], () => fetchMemoList('org-a'))
```

Peer-depends on `@tanstack/query-core`, not `@tanstack/react-query`/`@tanstack/vue-query` —
mount your own `<QueryClientProvider client={ctx.cache.client}>` / `VueQueryPlugin` around
`ctx.cache.client` in your app to get `useQuery` for free in components. This package and
`scope-context-react`/`-vue` never need to know about each other.

MIT licensed.
