# scope-context-react

React bindings for [`scope-context`](../scope-context): a `<ScopeProvider>` that threads a
`ScopeContext` through the component tree without prop-drilling, applies its theme as CSS
custom properties by default, and exposes `useScope()` plus per-axis hooks.

Does not depend on any specific cache/storage/comms implementation — it only knows about
`ScopeContext`'s shape, so it composes freely with `scope-context-tanstack-query`,
`scope-context-dexie`, `scope-context-penpal`, or your own custom adapters.

```tsx
import { ScopeManager } from 'scope-manager'
import { createScopeContext, type ScopeContext } from 'scope-context'
import { ScopeProvider, useScope, useScopedRequest } from 'scope-context-react'

const scopes = new ScopeManager<ScopeContext>({
  createScope: (id) => createScopeContext(id),
  disposeScope: (ctx) => ctx.destroy(),
})

function App() {
  return (
    <>
      <ScopeProvider value={scopes.getOrCreate('org-a')}><OrgPanel /></ScopeProvider>
      <ScopeProvider value={scopes.getOrCreate('org-b')}><OrgPanel /></ScopeProvider>
    </>
  )
}

function OrgPanel() {
  const { scopeId } = useScope()
  const request = useScopedRequest()
  // ...
}
```

`useScope()` is the primary API (same "umbrella hook first" shape as `@tanstack/react-query`'s
`useQueryClient()`); `useScopedStorage`/`useScopedCache`/`useScopedRequest`/`useScopedComms`/
`useScopedTheme`/`useScopedMemory` are one-line derivations of it for narrower typing in leaf
components. Set `<ScopeProvider applyTheme={false}>` to skip the theme wrapper `<div>` in
layouts that can't tolerate an extra DOM node, and read `useScopedTheme()` to apply it yourself.

MIT licensed.
